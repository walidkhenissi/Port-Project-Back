var router = require('express').Router();
const salesTransactionDao = require("../dao/salesTransactionDao");
const saleDao = require("../dao/saleDao");
const salesTransactionPaymentDao = require("../dao/salesTransactionPaymentDao");
const balanceController = require("../controllers/balanceController");
const boxesTransactionController = require("../controllers/boxesTransactionController");
const saleController = require("../controllers/saleController");
const commissionController = require("../controllers/commissionController");
const Response = require("../utils/response");
const {CommissionValue, Merchant, PaymentInfo, Shipowner, Article} = require("../models");
const dao = require("../dao/saleDao");
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await salesTransactionDao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const whereCriteria1 = _.clone(criteria.where);
        const data = await salesTransactionDao.find(criteria);
        const count = await salesTransactionDao.count({where: whereCriteria});
        const sum = await salesTransactionDao.sum({where: whereCriteria1});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        response.metaData.sum = sum;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await salesTransactionDao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    let salesTransaction = req.body;
    let sale;
    try {
        try {
            salesTransaction = await router.checkDataConstraints(salesTransaction);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        salesTransaction = await router.checkPaymentInfo(salesTransaction);
        try {
            await router.checkRecipientNumber(salesTransaction);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        try {
            sale = await saleDao.get(salesTransaction.saleId);
            if (!sale)
                return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        salesTransaction = router.calculateValues(salesTransaction);
        // console.log("=====================>salesTransaction after values calculation : " + JSON.stringify(salesTransaction));
        salesTransaction.totalMerchantPayment = 0;
        salesTransaction.totalToPayToProducer = 0;
        salesTransaction.totalToPayByMerchant = 0;
        salesTransaction.restMerchantPayment = 0;
        salesTransaction.producerCommission = 0;
        salesTransaction.merchantCommission = 0;
        salesTransaction.date = sale.date;
        const transactionNumber = await salesTransactionDao.nextSaleNumber(salesTransaction);
        salesTransaction.transactionNumber = 'BL'.concat('_').concat(moment(salesTransaction.date).format('YY')).concat('_').concat(transactionNumber.toString().padStart(6, '0'));
        salesTransaction = await router.BuildSaleTransactionName(salesTransaction);
        const createdSaleTransaction = await salesTransactionDao.create(salesTransaction);
        await boxesTransactionController.persistBySalesTransaction(createdSaleTransaction);
        await commissionController.updateCommissionsBySaleTransaction(createdSaleTransaction.id);
        await balanceController.updateMerchantBalance(createdSaleTransaction.merchantId, sale.date);
        await balanceController.updateBeneficiaryCommissionsBalance(sale.date);
        res.status(201).json(new Response(createdSaleTransaction));
    } catch (error) {
        console.error('Error creating salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    let salesTransaction = req.body;
    try {
        const oldSalesTransaction = JSON.parse(JSON.stringify(await salesTransactionDao.get(salesTransaction.id)));
        let updated;
        try {
            updated = await router.update(salesTransaction);
        } catch (err) {
            if (err.message == '#EXCEED_PAYMENT_VALUE') {
                //Undo salesTransaction update
                await router.update(oldSalesTransaction);
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            }
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        const salesTransactionPayments = await salesTransactionPaymentDao.list({where: {salesTransactionId: salesTransaction.id}});
        const affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
        // console.log("=====================>affectedPaymentsValue : " + JSON.stringify(affectedPaymentsValue));
        // console.log("=====================>updated.totalToPayByMerchant : " + JSON.stringify(updated.totalToPayByMerchant));
        if (affectedPaymentsValue > updated.totalToPayByMerchant) {
            //Undo salesTransaction update
            await router.update(oldSalesTransaction);
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        } else {
            updated.totalMerchantPayment = affectedPaymentsValue;
            updated = await router.checkPaymentInfo(updated);
            updated = await salesTransactionDao.update(updated);
        }
        return res.status(201).json(new Response(updated));
    } catch (err) {
        console.error('Error updating salesTransaction :', err.message);
        return res.status(500).json(new Response({errorCode: err.message}, true));
    }
});

router.update = async function (salesTransaction) {
    try {
        // console.log("=====================>salesTransaction : " + JSON.stringify(salesTransaction));
        salesTransaction = await router.checkDataConstraints(salesTransaction);
        // console.log("=====================>salesTransaction : " + JSON.stringify(salesTransaction));
    } catch (e) {
        throw new Error('#INTERNAL_ERROR');
        return;
    }
    try {
        await router.checkRecipientNumber(salesTransaction);
    } catch (e) {
        throw new Error('#RECIPIENT_NUMBER_ERROR');
        return;
    }
    salesTransaction = router.calculateValues(salesTransaction);
    const oldSaleTransaction = await salesTransactionDao.get(salesTransaction.id);
    //Persist salesTransaction in DB
    const updated = await salesTransactionDao.update(salesTransaction);
    await boxesTransactionController.persistBySalesTransaction(updated);
    const sale = await saleDao.get(updated.saleId);
    let updatedSaleTransaction = await commissionController.updateCommissionsBySaleTransaction(salesTransaction.id);
    await balanceController.updateMerchantBalance(oldSaleTransaction.merchantId, sale.date);
    if (oldSaleTransaction.merchantId != salesTransaction.merchantId)
        await balanceController.updateMerchantBalance(salesTransaction.merchantId, sale.date);
    await balanceController.updateBeneficiaryCommissionsBalance(sale.date);
    return updatedSaleTransaction;
}

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await salesTransactionDao.get(id);
        if (!found)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        let salesTransactionPayments = await salesTransactionPaymentDao.find({where: {salesTransactionId: id}});
        if (salesTransactionPayments.length)
            return res.status(404).json(new Response({errorCode: '#ATTACHED_PAYMENTS'}, true));
        //Deleting salesTransation's commissionValues
        await CommissionValue.destroy({where: {salesTransactionId: id}});
        //Deleting SalesTransaction
        const removed = await salesTransactionDao.remove(id);
        await boxesTransactionController.persistBySalesTransaction(found, true);
        //Try to find the parent Sale
        const sale = await saleDao.get(found.saleId);
        await saleController.update(sale);
        await balanceController.updateMerchantBalance(found.merchantId, sale.date);
        await balanceController.updateBeneficiaryCommissionsBalance(sale.date);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing salesTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.checkRecipientNumber = async function (saleTransaction) {
    // if (tools.isFalsey(saleTransaction.receiptNumber))
    //     return;
    // let criteria = {where: {receiptNumber: saleTransaction.receiptNumber}};
    // if (saleTransaction.id)
    //     criteria.where.id = {'!': saleTransaction.id};
    // const result = await salesTransactionDao.find(criteria);
    // if (result && result.length > 0) {
    //     const error = new Error('#RECIPIENT_NUMBER_ERROR');
    //     console.error(error.message);
    //     throw error;
    // }
    return;
}

router.checkDataConstraints = async function (saleTransaction) {
    let isError = false;
    if (!saleTransaction.saleId)
        isError = true;
    else if (!saleTransaction.merchantId)
        isError = true;
    else if (!saleTransaction.articleId)
        isError = true;
    else if (tools.isFalsey(saleTransaction.boxes) && tools.isFalsey(saleTransaction.grossWeight))
        isError = true;
    else if (tools.isFalsey(saleTransaction.unitPrice))
        isError = true;
    if (isError) {
        const error = new Error('Data contraints error');
        console.error(error.message);
        throw error;
    }
    saleTransaction = await router.BuildSaleTransactionName(saleTransaction);
    return saleTransaction;
}

router.BuildSaleTransactionName = async function (salesTransaction) {
    if (salesTransaction.merchantId) {
        let merchant = await Merchant.findByPk(salesTransaction.merchantId);
        if (!merchant) {
            throw new Error('SalesTransaction Owner Error! Not found merchant!');
            return;
        } else
            salesTransaction.name = merchant.name.concat(' | ').concat(salesTransaction.transactionNumber).concat(' | ').concat(moment(salesTransaction.date).format('YYYY-MM-DD'));
    }
    return salesTransaction;
}

router.calculateValues = function (saleTransaction) {
    if (!tools.isFalsey(saleTransaction.boxes) && _.isNumber(saleTransaction.boxes) && saleTransaction.boxes > 0 && (tools.isFalsey(saleTransaction.grossWeight) || saleTransaction.grossWeight == 0)) {
        //Product selled by box
        saleTransaction.totalPrice = Number(parseFloat(saleTransaction.boxes * saleTransaction.unitPrice).toFixed(3));
    } else if (!tools.isFalsey(saleTransaction.boxes) && _.isNumber(saleTransaction.boxes) && !tools.isFalsey(saleTransaction.grossWeight) && _.isNumber(saleTransaction.grossWeight) && saleTransaction.grossWeight > 0) {
        //Product selled by Kg in boxes
        saleTransaction.netWeight = Number(parseFloat(saleTransaction.grossWeight - (saleTransaction.subtractedWeight || 0)).toFixed(3));
        saleTransaction.totalPrice = Number(parseFloat(saleTransaction.netWeight * saleTransaction.unitPrice).toFixed(3));
    } else if ((tools.isFalsey(saleTransaction.boxes) || saleTransaction.boxes == 0) && !tools.isFalsey(saleTransaction.grossWeight) && _.isNumber(saleTransaction.grossWeight) && saleTransaction.grossWeight > 0) {
        //Product selled by Kg without boxes
        saleTransaction.netWeight = Number(parseFloat(saleTransaction.grossWeight - (saleTransaction.subtractedWeight || 0)).toFixed(3));
        saleTransaction.totalPrice = Number(parseFloat(saleTransaction.netWeight * saleTransaction.unitPrice).toFixed(3));
    }
    return saleTransaction;
}

router.checkPaymentInfo = async function (salesTransaction) {
    salesTransaction.totalToPayByMerchant = salesTransaction.totalToPayByMerchant || 0;
    if (tools.isFalsey(salesTransaction.totalMerchantPayment))
        salesTransaction.totalMerchantPayment = 0;
    salesTransaction.restMerchantPayment = Number(parseFloat(salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment).toFixed(3));
    let criteriaRef;
    if (salesTransaction.totalMerchantPayment == 0) {
        criteriaRef = {reference: 'NOT_PAYED'};
    } else if (salesTransaction.restMerchantPayment == 0) {
        criteriaRef = {reference: 'PAYED'};
    } else {
        criteriaRef = {reference: 'PARTIALLY_PAYED'};
    }
    // console.log("=====================>salesTransaction : " + JSON.stringify(salesTransaction));
    const paymentInfo = await PaymentInfo.findOne({where: criteriaRef});
    if (!paymentInfo) {
        throw new Error('No payment Info definition Error');
        return;
    }
    salesTransaction.paymentInfoId = paymentInfo.id;
    return salesTransaction;
}
/**************************************/
router.post('/generateSalesTransactionReport', async (req, res) => {
    const { startDate, endDate, merchant, article } = req.body;
    try
    {
        const dataToReport = await router.getSalesTransactionReportData(req.body);
        if (req.body.excelType){
            router.generateExcelSalesTransactionReport(dataToReport, res);
        }else if (req.body.pdfType){
            router.generatePDFSalesTransactionReport(dataToReport,req.body, res);
        } else{
            // Si aucun type de fichier n'est spécifié, renvoyez les données sous forme de JSON
            res.status(200).json({
                message: 'Report data fetched successfully',
                data: dataToReport
            });
        }
    }catch (error){
        console.error('Error generating sales report:', error);

        res.status(500).json({ error: 'Error generating report' });
    }
});

router.getSalesTransactionReportData = async function (options) {
    let criteria = {where: {}};

    if (!tools.isFalsey(options.dateRule)) {
        switch (options.dateRule) {
            case 'equals' : {
                const startOfDay = new Date(options.startDate).setHours(0, 0, 0, 0);
                const endOfDay = new Date(options.startDate).setHours(23, 59, 59, 999);
                criteria.where.date = { '>=': startOfDay, '<=': endOfDay };
                break;
            }
            case 'notEquals' : {
                criteria.where.date = {'!': options.startDate};
                break;
            }
            case 'lowerThan' : {
                criteria.where.date = {'<=': options.startDate};
                break;
            }
            case 'greaterThan' : {
                criteria.where.date = {'>=': options.startDate};
                break;
            }
            case 'between' : {
                criteria.where.date = {'>=': options.startDate, '<=': options.endDate};
                break;
            }
            default:
                break;
        }
    }


        if (!tools.isFalsey(options.merchant))
            criteria.where.merchantId = options.merchant;
        if (!tools.isFalsey(options.article))
          criteria.where.articleId = options.article;
        if (!tools.isFalsey(options.saleId)) {
            criteria.where.saleId = options.saleId;
        }
        let transasctions = await salesTransactionDao.find(criteria);
        return transasctions;

};

router.generatePDFSalesTransactionReport = async function (data, filter,res) {
    const { startDate, endDate, merchant, article } = filter;
    let titleRow = [];
    titleRow.push([
        {text: 'Date', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee' },
        {text: 'Client', fontSize: 12, alignment: 'center',bold: true ,fillColor: '#eeeeee'},
        {text: 'Article ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Quantite  ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Poid Net ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Prix Unite', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Prix Total ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'}
    ]);
    let salesReportData = [];
    let totalPriceSum =0;
    let totalQuantitySum=0;
    let totalWeightSum =0;
    for (const transaction of data) {
            totalQuantitySum +=transaction.boxes;
            totalWeightSum +=transaction.netWeight;
            totalPriceSum += transaction.totalPrice;
            salesReportData.push([
                {text: transaction.date, fontSize: 13, alignment: 'center'},
                {text: transaction.merchant?.name || 'Non spécifié',fontSize: 13, alignment: 'center'},
                {text: transaction.article ? transaction.article.name : 'Non spécifié',fontSize: 13, alignment: 'center' },
                {text: transaction.boxes, fontSize: 13, alignment: 'center'},
                {text: transaction.netWeight, fontSize: 13, alignment: 'center'},
                {text: transaction.unitPrice, fontSize: 13, alignment: 'center'},
                {text: transaction.totalPrice.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2}), fontSize: 13, alignment: 'center'},
            ]);

    }
    salesReportData.push([
        { text: 'Total', fontSize: 13, alignment: 'center', bold: true,colSpan: 3},
        '', '',
        { text: totalQuantitySum, fontSize: 13, alignment: 'center', bold: true },
        { text: totalWeightSum, fontSize: 13, alignment: 'center', bold: true },
        '',
       { text: totalPriceSum.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }), fontSize: 10, alignment: 'center', bold: true },
    ]);

    const formattedStartDate = startDate
        ? new Date(startDate).toLocaleDateString('fr-TN')
        : null;
    const formattedEndDate = endDate && endDate !== startDate
        ? new Date(endDate).toLocaleDateString('fr-TN')
        : null;
    let period = '';
    if (formattedStartDate && !formattedEndDate) {
        period = `de : ${formattedStartDate}`;
    }else if (formattedStartDate && formattedEndDate) {
        period = `Période : ${formattedStartDate} à ${formattedEndDate}`;
    }

    let articleName = '';
    if (article) {
        const articleData = await Article.findByPk(article);
        articleName = articleData ? `Produit : ${articleData.name}` : '';
    }
    let merchantName = '';
    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        merchantName = merchantData ? `Commerçant : ${merchantData.name}` : '';
    }
    let title='Liste des comptes commercants';
    let reportTitle=[];
    if (articleName) {
        reportTitle.push(`${articleName}`);
    }
    if (merchantName) {
        reportTitle.push(`${merchantName}`);
    }
    if (period) {
        reportTitle.push(period);
    }

    let generationDate = `Date de génération : ${new Date().toLocaleDateString("fr-FR")}`;

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'portrait',
        defaultStyle: {
            fontSize: 10,
            columnGap: 20
        },
        content: []
    };
    docDefinition.content.push({
        text: title,
        fontSize: 22,
        alignment: 'center',
        margin: [0, 20]
    });
    docDefinition.content.push({
        text: reportTitle.join('\n'),
        fontSize: 15,
        alignment: 'center',
        margin: [0, 20]
    });

    docDefinition.content.push({
        text: generationDate,
        fontSize: 10,
        alignment: 'right',
        margin: [0, 0, 0, 10]
    });
    docDefinition.content.push('\n');

    docDefinition.content.push({
        columns: [
            {
                table: {
                    body: [
                        ...titleRow,
                        ...salesReportData],
                    widths: ['15%', '20%', '15%', '15%', '15%', '10%', '10%']
                },
            }
        ]
    });

    docDefinition.content.push('\n');

    // var PdfPrinter = require('pdfmake');
    var fonts = {
        Roboto: {
            normal: './assets/fonts/roboto/Roboto-Regular.ttf',
            bold: './assets/fonts/roboto/Roboto-Bold.ttf',
            italics: './assets/fonts/roboto/Roboto-Italic.ttf',
            bolditalics: './assets/fonts/roboto/Roboto-BoldItalic.ttf'
        }
    };

    var PdfPrinter = require('pdfmake/src/printer');
    var printer = new PdfPrinter(fonts);
    var fs = require('fs');
    var options = {
        // ...
    };

    fileName = "achatClient.pdf";
    await tools.cleanTempDirectory(fs, path);
    try {
        var pdfDoc = printer.createPdfKitDocument(docDefinition, options);
        pdfDoc.pipe(fs.createWriteStream(tools.PDF_PATH + fileName)).on('finish', function () {
            res.status(201).json(new Response(fileName,path));
        });
        pdfDoc.end();
    } catch (err) {
        console.log("=====================>err : " + JSON.stringify(err));
        res.status(404).json(new Response(err, true));
    }
}

router.generateExcelSalesTransactionReport = async function (data, res) {
    try{
        const title = `État d'achat' `;

    } catch (error) {
        console.error("Erreur lors de la génération du fichier Excel :", error);
        res.status(500).json({ success: false, message: error.message });
    }

};




module.exports = router;
