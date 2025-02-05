var router = require('express').Router();
const salesTransactionDao = require("../dao/salesTransactionDao");
const saleDao = require("../dao/saleDao");
const salesTransactionPaymentDao = require("../dao/salesTransactionPaymentDao");
const balanceController = require("../controllers/balanceController");
const boxesTransactionController = require("../controllers/boxesTransactionController");
const saleController = require("../controllers/saleController");
const commissionController = require("../controllers/commissionController");
const Response = require("../utils/response");
const {CommissionValue, Merchant, PaymentInfo, Article} = require("../models");
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
//const ExcelJS = require("exceljs");
const {forEach} = require("lodash/core");
const xl = require('excel4node');
const _ = require("lodash");
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
        const sum = await salesTransactionDao.sum({where: {id:_.map(data, 'id')}});
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
            if (!sale) return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
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
        salesTransaction.receiptNumber = sale.receiptNumber;
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
    if (oldSaleTransaction.merchantId != salesTransaction.merchantId) await balanceController.updateMerchantBalance(salesTransaction.merchantId, sale.date);
    await balanceController.updateBeneficiaryCommissionsBalance(sale.date);
    return updatedSaleTransaction;
}

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await salesTransactionDao.get(id);
        if (!found) return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        let salesTransactionPayments = await salesTransactionPaymentDao.find({where: {salesTransactionId: id}});
        if (salesTransactionPayments.length) return res.status(404).json(new Response({errorCode: '#ATTACHED_PAYMENTS'}, true));
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
    if (!saleTransaction.saleId) isError = true; else if (!saleTransaction.merchantId) isError = true; else if (!saleTransaction.articleId) isError = true; else if (tools.isFalsey(saleTransaction.boxes) && tools.isFalsey(saleTransaction.grossWeight)) isError = true; else if (tools.isFalsey(saleTransaction.unitPrice)) isError = true;
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
        } else salesTransaction.name = merchant.name.concat(' | ').concat(salesTransaction.transactionNumber).concat(' | ').concat(moment(salesTransaction.date).format('YYYY-MM-DD'));
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
    if (tools.isFalsey(salesTransaction.totalMerchantPayment)) salesTransaction.totalMerchantPayment = 0;
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
router.post('/generateSalesTransactionReport',async (req, res) => {
    // const {startDate, endDate, merchant, article} = req.body;
    //console.log("valeur de request:",req.session.username);
    try {
        const dataToReport = await router.getSalesTransactionReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelSalesTransactionReport(dataToReport, req.body, res,username);
        } else if (req.body.pdfType) {
            await router.generatePDFSalesTransactionReport(dataToReport, req.body, res,username);
        } else {
            // Si aucun type de fichier n'est spécifié, renvoyez les données sous forme de JSON
            res.status(200).json({
                message: 'Report data fetched successfully', data: dataToReport
            });
        }
    } catch (error) {
        console.error('Error generating transaction  report:', error);

        res.status(500).json({error: 'Error generating report'});
    }
});

router.getSalesTransactionReportData = async function (options) {
    let criteria = {where: {}};

    if (!tools.isFalsey(options.dateRule)) {
        switch (options.dateRule) {
            case 'equals' : {
                const startOfDay = new Date(options.startDate).setHours(0, 0, 0, 0);
                const endOfDay = new Date(options.startDate).setHours(23, 59, 59, 999);
                criteria.where.date = {'>=': startOfDay, '<=': endOfDay};
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
    if (!tools.isFalsey(options.merchant)) criteria.where.merchantId = options.merchant;
    if (!tools.isFalsey(options.article)) criteria.where.articleId = options.article;
    if (!tools.isFalsey(options.saleId)) {
        criteria.where.saleId = options.saleId;

    }
    let transasctions = await salesTransactionDao.findAll(criteria);

    return transasctions;

}
router.generateReportTitle = async function (filter,username ) {
    const {merchant, article, startDate, endDate, dateRule} = filter;
    let title = 'Liste Des Achats Des Commerçants';
    let reportTitle = [];
    let period = '';
    let articleName = '';
    let merchantName = '';

    if (article) {
        const articleData = await Article.findByPk(article);
        articleName = articleData ? `Pour L' Article : ${articleData.name.toUpperCase()}` : '';
    }

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = `Liste Des Achats \n Du Commerçant : ${merchantData.name.toUpperCase()}`;
            merchantName = merchantData.name;
        }
    }

    switch (dateRule) {
        case 'equals':
            period = startDate ? `Le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date exacte non spécifiée';
            break;
        case 'notEquals':
            period = startDate ? `Autre que : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date à exclure non spécifiée';
            break;
        case 'lowerThan':
            period = startDate ? `Avant le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date limite non spécifiée';
            break;
        case 'greaterThan':
            period = startDate ? `Après le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date de début non spécifiée';
            break;
        case 'between':
            const formattedStart = startDate ? new Date(startDate).toLocaleDateString('fr-TN') : null;
            const formattedEnd = endDate ? new Date(endDate).toLocaleDateString('fr-TN') : null;
            period = formattedStart && formattedEnd ? `Du : ${formattedStart} Au ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : 'Période non spécifiée';
            break;
        default:
            period = '';
    }

    reportTitle.push(title);
    if (articleName) reportTitle.push(articleName);

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;

    return {
        title, reportTitle: reportTitle.join('\n'), period, generationDate,
    };
}

router.generatePDFSalesTransactionReport = async function (data, filter, res,username) {
    const {title, reportTitle, period, generationDate} = await router.generateReportTitle(filter,username);
    let titleRow = [];
    titleRow.push([
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Producteur', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        !filter.merchant ? {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'} : null,
        !filter.article ? {text: 'Article', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'} : null,
        {text: 'Quantite', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Poid Net', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Prix Unite', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Prix Total', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}].filter(Boolean));
    const filteredData = data.filter(transaction => {
        if (!filter.merchant && !filter.article) return true;

        return (!filter.merchant ||  transaction.merchant?.id  === filter.merchant) &&
            (!filter.article || transaction.article?.id === filter.article);
    });
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    const groupedByDate = _.groupBy(filteredData, item => item.date);

    let salesReportData = [];
    let totalPriceSum = 0;
    let totalQuantitySum = 0;
    let totalWeightSum = 0;


    Object.keys(groupedByDate).forEach(date => {
        const dateGroup = groupedByDate[date];
        const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
        Object.keys(groupedByProducer).forEach(producer => {
            const producerGroup = groupedByProducer[producer];
            const groupedByMerchant = _.groupBy(producerGroup, item => item.merchant?.name);
            Object.keys(groupedByMerchant).forEach(merchant => {
                const merchantGroup = groupedByMerchant[merchant];
                const groupedByArticle = _.groupBy(merchantGroup, item => item.article?.name);
                Object.keys(groupedByArticle).forEach(article => {
                    const articleGroup = groupedByArticle[article];

                    let isFirstRow = true;
                    const calculateMargin  = (rowSpan, lineHeight = 1.5, fontSize = 9) => {
                        const totalRowHeight = rowSpan * fontSize * lineHeight; // Hauteur totale pour les lignes fusionnées
                        const cellHeight = fontSize; // Hauteur du texte dans la cellule
                        const verticalMargin = (totalRowHeight - cellHeight) / 2; // Centrage vertical
                        return [0, verticalMargin, 0, verticalMargin];
                    };
                    articleGroup.forEach((transaction, index) => {
                        totalQuantitySum += transaction.boxes;
                        totalWeightSum += transaction.netWeight;
                        totalPriceSum += transaction.totalToPayByMerchant;

                        const row = [
                            isFirstRow ? {text: transaction.date, rowSpan: dateGroup.length, fontSize: 9, alignment: 'center', margin:calculateMargin(dateGroup.length)} : null,
                            isFirstRow ? {text: transaction.sale.producerName.toUpperCase(), rowSpan: producerGroup.length, fontSize: 9, alignment: 'center',margin: calculateMargin(producerGroup.length)} : null,
                            !filter.merchant ? (isFirstRow ? {text: transaction.merchant?.name.toUpperCase() || "Non spécifié", rowSpan: merchantGroup.length, fontSize: 9, alignment: 'center',margin: calculateMargin(merchantGroup.length)} : null) : null,
                            !filter.article ? (isFirstRow ? {text: transaction.article?.name || "Non spécifié", rowSpan: articleGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(articleGroup.length)} : null) : null,
                            {text: transaction.boxes, fontSize: 9, alignment: 'center', margin: [0, 3]},
                            {text: transaction.netWeight, fontSize: 9, alignment: 'center', margin: [0, 3]},
                            {text: transaction.unitPrice.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 9, alignment: 'right', margin: [0, 3]},
                            {text: transaction.totalToPayByMerchant.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 9, alignment: 'right', margin: [0, 3]}
                        ].filter(Boolean);

                        salesReportData.push(row);


                    });
                });
            });
        });
    });

    salesReportData.push([{
          text: 'Total',
          fontSize: 10,
          alignment: 'center',
          bold: true,colSpan: 4 - (filter.article ? 1 : 0) - (filter.merchant ? 1 : 0) , margin: [0, 3]},
          '',
          ...(filter.merchant ? [] : ['']),
          ...(filter.article ? [] : ['']),
          {text: totalQuantitySum, fontSize: 9, alignment: 'center', bold: true, margin: [0, 3]},
          {text: totalWeightSum, fontSize: 9, alignment: 'center', bold: true, margin: [0, 3]},
          '',
          {text: totalPriceSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 9, alignment: 'right', bold: true, margin: [0, 3]},
      ]);



    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25,25],
        pageOrientation: 'portrait',
        defaultStyle: {
            fontSize: 10, columnGap: 20
        },
        content: [
            {text: reportTitle, fontSize: 14, alignment: 'center',decoration: 'underline',font:'Roboto', bold: true, margin: [0, 20, 0, 10]},
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            { text: generationDate, fontSize: 10, alignment: 'right' },
           ' \n',

            {
            columns: [{

                table: {
                    body: [...titleRow, ...salesReportData],
                    widths: ['auto', 93,!filter.merchant ? 82 : 0, !filter.article ? 85 : 0, 40, 40, 45, '*'].filter(Boolean),
                },
            },],
        },],
        footer: function (currentPage, pageCount) {
            return {
                columns: [
                    {
                        text: ` Page ${currentPage} / ${pageCount}`,
                        alignment: 'right',
                        margin: [0, 0, 40, 80],
                        fontSize: 10
                    },
                ],
            };
        },
    };

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
            res.status(201).json(new Response(fileName, path));
        });
        pdfDoc.end();
    } catch (err) {
        console.log("=====================>err : " + JSON.stringify(err));
        res.status(404).json(new Response(err, true));
    }
}

router.generateExcelSalesTransactionReport = async function (data, filter, res,username) {
    try {
        const {title, reportTitle, period, generationDate} = await router.generateReportTitle(filter,username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        const titleRow = ['Date', 'Producteur',  (!filter.merchant ?'Client':'' ) , (!filter.article ?'Article' :''  ),  'Quantite', 'Poid Net', 'Prix Unite', 'Prix Total'].filter(Boolean);

        ws.cell(1, 1, 1, titleRow.length, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, titleRow.length, true)
            .string(reportTitle)
            .style({
                font: {size: 12, bold: true,underline:true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, titleRow.length, true)
            .string(period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(70);
        ws.cell(4, 1).string('');

        const headerStyle = wb.createStyle({
            font: { bold: true, size: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0' },
            border : {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const tableWidth = 100;
        const columnCount = titleRow.length;
        const columnWidth = Math.floor(tableWidth / columnCount);
        titleRow.forEach((title, index) => {
            ws.cell(5, index + 1).string(title).style(headerStyle);
            ws.column(index + 1).setWidth(columnWidth);
        });
        const rowStyle = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });
        const rowStyleRight = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });

        let rowIndex = 6;
        const filteredData = data.filter(transaction => {
            return (!filter.merchant || transaction.merchant?.id === filter.merchant) &&
                (!filter.article || transaction.article?.id === filter.article);
        });
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        const groupedByDate = _.groupBy(filteredData, item => item.date);

        let totalPriceSum = 0;
        let totalQuantitySum = 0;
        let totalWeightSum = 0;


        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
            let isFirstDateRow = true;
            Object.keys(groupedByProducer).forEach(producer => {
                const producerGroup = groupedByProducer[producer];
                const groupedByMerchant = _.groupBy(producerGroup, item => item.merchant?.name);
                let isFirstProducerRow = true;
                Object.keys(groupedByMerchant).forEach(merchant => {
                    const merchantGroup = groupedByMerchant[merchant];
                    const groupedByArticle = _.groupBy(merchantGroup, item => item.article?.name);
                    let isFirstMerchantRow = true;
                    Object.keys(groupedByArticle).forEach(article => {
                        const articleGroup = groupedByArticle[article];

                        articleGroup.forEach((transaction, index) => {
                            totalQuantitySum += transaction.boxes || 0;
                            totalWeightSum += transaction.netWeight || 0;
                            totalPriceSum += transaction.totalToPayByMerchant || 0;

                            if (isFirstDateRow) {
                                ws.cell(rowIndex, 1, rowIndex + dateGroup.length - 1, 1, true)
                                    .string(transaction.date || "Non spécifié")
                                    .style(rowStyle);
                                ws.column(1).setWidth(8);
                                isFirstDateRow = false;
                            }
                            if (isFirstProducerRow) {
                                ws.cell(rowIndex, 2, rowIndex + producerGroup.length - 1, 2, true).string(transaction.sale.producerName.toUpperCase() || "Non spécifié").style(rowStyle);
                                isFirstProducerRow = false;
                            }

                            if (!filter.merchant) {
                                if (isFirstMerchantRow) {
                                    ws.cell(rowIndex, 3, rowIndex + merchantGroup.length - 1, 3, true).string(transaction.merchant?.name.toUpperCase() || "Non spécifié").style(rowStyle);
                                    isFirstMerchantRow = false;
                                }
                            }

                            if (!filter.article ) {
                                 if (!filter.merchant) {
                               ws.cell(rowIndex, 4,rowIndex + articleGroup.length - 1, 4, true)
                                        .string(transaction.article?.name.toUpperCase() || "Non spécifié")
                                        .style(rowStyle);
                                }else {
                                     ws.cell(rowIndex, 3, rowIndex + articleGroup.length - 1, 3, true)
                                         .string(transaction.article?.name.toUpperCase() || "Non spécifié")
                                    .style(rowStyle);
                            }
                             }
                              let colIndex = 3;
                                  if (!filter.merchant) colIndex += 1;
                                  if (!filter.article) colIndex += 1;
                            ws.cell(rowIndex, colIndex).number(transaction.boxes || 0).style(rowStyle);
                                ws.column(colIndex).setWidth(7);
                            ws.cell(rowIndex, colIndex + 1).number(transaction.netWeight || 0).style(rowStyle);
                                ws.column(colIndex+ 1).setWidth(7);
                                ws.cell(rowIndex, colIndex + 2).string(transaction.unitPrice.toLocaleString("fr-TN", {style: "decimal", minimumFractionDigits: 2}) || "0.00").style(rowStyleRight);
                                ws.column(colIndex+ 2).setWidth(9);
                                ws.cell(rowIndex, colIndex + 3).string(transaction.totalPrice.toLocaleString("fr-TN", {style: "decimal", minimumFractionDigits: 2}) || "0.00").style(rowStyleRight);
                            rowIndex++;

                        });
                    });
                });
            });
        });
        let totalStartCol = 1;
        let totalEndCol = 4;
        if (filter.merchant) totalEndCol -= 1;
        if (filter.article) totalEndCol -= 1;
        const totalStyle = wb.createStyle({
            font: { size: 10, bold: true },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        });
        const totalPriceStyle = wb.createStyle({
            font: { size: 10, bold: true },
            alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        });
        ws.cell(rowIndex, totalStartCol, rowIndex, totalEndCol, true).string('Total').style(totalStyle);
        const totalData = [totalQuantitySum, totalWeightSum, '', totalPriceSum.toLocaleString('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 2 })];

        totalData.forEach((value, colIndex) => {
            let currentStyle = (colIndex === totalData.length - 1) ? totalPriceStyle : totalStyle;
            ws.cell(rowIndex, totalEndCol + 1 + colIndex)
                .string(value.toString())
                .style(currentStyle);
        });

        const fileName = "achatClient.xlsx";
        const excelFile = tools.Excel_PATH;
        if (!fs.existsSync(excelFile)) {
            fs.mkdirSync(excelFile, {recursive: true});
        }
        const filePath = path.join(excelFile, fileName);

        wb.write(filePath,function (err, stats){
            if (err) {
                console.error("Error generating Excel file:", err);
                return res.status(500).send('Error generating Excel file');
            }
            res.status(201).json(new Response(fileName));
            res.download(filePath);
        });
    } catch (err) {
        console.error("Erreur lors de la génération du fichier Excel:", err);
        res.status(500).json({ success: false, message: err.message });
    }

};

/*****************************/
router.post('/generateAccountReport',async (req, res) => {
    // const {startDate, endDate, merchant, article} = req.body;
    try {
        const dataToReport = await router.getAccountReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelAccountReport(dataToReport, req.body, res,username);
        } else if (req.body.pdfType) {
            await router.generatePDFAccountReport(dataToReport, req.body, res,username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: dataToReport
            });
        }
    } catch (error) {
        console.error('Error generating Account report:', error);
        res.status(500).json({error: 'Error generating report'});
    }
});
router.getAccountReportData = async function (options) {
    let criteria = {where: {}};

    if (!tools.isFalsey(options.dateRule)) {
        switch (options.dateRule) {
            case 'equals' : {
                const startOfDay = new Date(options.startDate).setHours(0, 0, 0, 0);
                const endOfDay = new Date(options.startDate).setHours(23, 59, 59, 999);
                criteria.where.date = {'>=': startOfDay, '<=': endOfDay};
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
    if (!tools.isFalsey(options.merchant)) criteria.where.merchantId = options.merchant;
    if (!tools.isFalsey(options.saleId)) {criteria.where.saleId = options.saleId;}
    let transasctions = await salesTransactionDao.findAll(criteria);

    return transasctions;

}
router.generateReportTitleAccount = async function (filter,username ) {
    const {merchant, article, startDate, endDate, dateRule} = filter;
    let title = 'États des comptes des commerçants';
    let reportTitle = [];
    let period = '';
    let merchantName = '';

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = ` État  Des comptes Du Commerçant : ${merchantData.name.toUpperCase()}`;
            merchantName = merchantData.name;
        }
    }

    switch (dateRule) {
        case 'equals':
            period = startDate ? `Le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date exacte non spécifiée';
            break;
        case 'notEquals':
            period = startDate ? `Autre que : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date à exclure non spécifiée';
            break;
        case 'lowerThan':
            period = startDate ? `Avant le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date limite non spécifiée';
            break;
        case 'greaterThan':
            period = startDate ? `Après le : ${new Date(startDate).toLocaleDateString('fr-TN')}` : 'Date de début non spécifiée';
            break;
        case 'between':
            const formattedStart = startDate ? new Date(startDate).toLocaleDateString('fr-TN') : null;
            const formattedEnd = endDate ? new Date(endDate).toLocaleDateString('fr-TN') : null;
            period = formattedStart && formattedEnd ? `Du : ${formattedStart} Au ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : 'Période non spécifiée';
            break;
        default:
            period = '';
    }

    reportTitle.push(title);
    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;

    return {
        title, period, generationDate,
    };
}
router.generatePDFAccountReport = async function (data, filter, res,username) {
    const {title, period, generationDate} = await router.generateReportTitleAccount(filter,username);
    let titleRow = [];
    titleRow.push(
        [
           { text: 'Achats',fontSize: 10, colSpan: 10- (filter.merchant ? 1 : 0) , alignment: 'center', bold: true, fillColor: '#E8EDF0' },
             {}, ...(filter.merchant ? [] : ['']), {}, {}, {}, {}, {}, {},{},
            { text: 'Règlements',fontSize: 10, colSpan: 3, alignment: 'center', bold: true, fillColor: '#E8EDF0' },
            {}, {}
        ],
        [
        {text: 'Date', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Producteur', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        !filter.merchant ? {text: 'Client', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'} : null,
        {text: 'Article', fontSize:9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Quantite', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Poid Net', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Prix Unite', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Sous Total', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Commission', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Prix Total', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Montant', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Type', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'N°Pièce', fontSize: 9, alignment: 'center', bold: true, fillColor: '#E8EDF0'}

    ].filter(Boolean));
    const filteredData = data.filter(transaction => {
        if (!filter.merchant ) return true;

        return (!filter.merchant ||  transaction.merchant?.id  === filter.merchant);
    });
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    const groupedByDate = _.groupBy(filteredData, item => item.date);

    let salesReportData = [];
    let totalPriceSum = 0;
    let totalQuantitySum = 0;
    let totalWeightSum = 0;
    let totalToPayByMerchantSum =0;
    let totalmerchantCommissionSum  =0;
    let totalMerchantPaymentSum =0;



    Object.keys(groupedByDate).forEach(date => {
        const dateGroup = groupedByDate[date];
        const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
        Object.keys(groupedByProducer).forEach(producer => {
            const producerGroup = groupedByProducer[producer];
            const groupedByMerchant = _.groupBy(producerGroup, item => item.merchant?.name);
            Object.keys(groupedByMerchant).forEach(merchant => {
                const merchantGroup = groupedByMerchant[merchant];
                const groupedByArticle = _.groupBy(merchantGroup, item => item.article?.name);
                Object.keys(groupedByArticle).forEach(article => {
                    const articleGroup = groupedByArticle[article];
                    let isFirstRow = true;
                    const calculateMargin  = (rowSpan, lineHeight = 1.5, fontSize = 9) => {
                        const totalRowHeight = rowSpan * fontSize * lineHeight;
                        const cellHeight = fontSize;
                        const verticalMargin = (totalRowHeight - cellHeight) / 2;
                        return [0, verticalMargin, 0, verticalMargin];
                    };
                    articleGroup.forEach((transaction, index) => {
                        totalQuantitySum += transaction.boxes;
                        totalWeightSum += transaction.netWeight;
                        totalPriceSum += transaction.totalPrice;
                        totalmerchantCommissionSum += transaction.merchantCommission;
                        totalToPayByMerchantSum += transaction.totalToPayByMerchant;
                        totalMerchantPaymentSum +=transaction.totalMerchantPayment;

                        const row = [
                            isFirstRow ? {text: transaction.date, rowSpan: dateGroup.length, fontSize: 8, alignment: 'center', margin:calculateMargin(dateGroup.length)} : null,
                            isFirstRow ? {text: transaction.sale.producerName.toUpperCase(), rowSpan: producerGroup.length, fontSize: 8, alignment: 'center',margin: calculateMargin(producerGroup.length)} : null,
                            !filter.merchant ? (isFirstRow ? {text: transaction.merchant?.name.toUpperCase() || "Non spécifié", rowSpan: merchantGroup.length, fontSize: 8, alignment: 'center',margin: calculateMargin(merchantGroup.length)} : null) : null,
                            isFirstRow ? {text: transaction.article?.name || "Non spécifié", rowSpan: articleGroup.length, fontSize: 8, alignment: 'center', margin: calculateMargin(articleGroup.length)} : null,
                            {text: transaction.boxes, fontSize: 8, alignment: 'center', margin: [0, 3]},
                            {text: transaction.netWeight, fontSize: 8, alignment: 'center', margin: [0, 3]},
                            {text: transaction.unitPrice.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', margin: [0, 3]},
                            {text: transaction.totalPrice.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', margin: [0, 3]},
                            {text: transaction.merchantCommission.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', margin: [0, 3]},
                            {text: transaction.totalToPayByMerchant.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', margin: [0, 3]},
                            {text: transaction.totalMerchantPayment.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', margin: [0, 3]},
                            {text: transaction.paymentInfo?.name || 'Non spécifié', fontSize: 8, alignment: 'center'},
                            {text: transaction.receiptNumber, fontSize: 8, alignment: 'right', margin: [0, 3]}

                        ].filter(Boolean);

                        salesReportData.push(row);
                    });
                });
            });
        });
    });

   salesReportData.push([{
        text: 'Total',
        fontSize: 9,
        alignment: 'center',
        bold: true,colSpan: 4 -  (filter.merchant ? 1 : 0) , margin: [0, 3]},
        '',
        ...(filter.merchant ? [] : ['']),
        '',
        {text: totalQuantitySum, fontSize: 8, alignment: 'center', bold: true, margin: [0, 3]},
        {text: totalWeightSum, fontSize:8, alignment: 'center', bold: true, margin: [0, 3]},
        '',
        {text: totalPriceSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]},
        {text: totalmerchantCommissionSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]},
        {text: totalToPayByMerchantSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]},
        {text: totalMerchantPaymentSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]},
         '',''
    ]);

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25,25],
        pageOrientation: 'landscape',
        defaultStyle: {
            fontSize: 10, columnGap: 20
        },
        content: [
            {text: title, fontSize: 14, alignment: 'center',decoration: 'underline',font:'Roboto', bold: true, margin: [0, 20, 0, 10]},
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            { text: generationDate, fontSize: 10, alignment: 'right' },
            ' \n',

            {
                columns: [{

                    table: {
                        body: [...titleRow, ...salesReportData],
                        widths: ['auto', 95,!filter.merchant ? 82 : 0, 80 ,40, 40, 40,'auto','auto','auto','auto','auto','*'].filter(Boolean),
                    },
                },],
            },],
        footer: function (currentPage, pageCount) {
            return {
                columns: [
                    {
                        text: ` Page ${currentPage} / ${pageCount}`,
                        alignment: 'right',
                        margin: [0, 0, 40, 80],
                        fontSize: 10
                    },
                ],
            };
        },
    };

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

    fileName = "etatCommercant.pdf";
    await tools.cleanTempDirectory(fs, path);
    try {
        var pdfDoc = printer.createPdfKitDocument(docDefinition, options);
        pdfDoc.pipe(fs.createWriteStream(tools.PDF_PATH + fileName)).on('finish', function () {
            res.status(201).json(new Response(fileName, path));
        });
        pdfDoc.end();
    } catch (err) {
        console.log("=====================>err : " + JSON.stringify(err));
        res.status(404).json(new Response(err, true));
    }
}
router.generateExcelAccountReport = async function (data, filter, res,username) {
    try {
        const {title, period, generationDate} = await router.generateReportTitleAccount(filter,username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        ws.pageSetup = {
            orientation: 'landscape',
            paperSize: 'A4',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: {left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, footer: 0.1, header: 0.1}
        };


        const titleRow = ['Date', 'Producteur',  (!filter.merchant ?'Client':'' ) , 'Article' ,  'Quantite', 'Poid Net', 'Prix Unite','Sous Total',
            'Commission','Prix Total','Montant','Type','N°Pièce'].filter(Boolean);


        ws.cell(1, 1, 1, titleRow.length, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, titleRow.length, true)
            .string(title)
            .style({
                font: {size: 12, bold: true,underline:true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, titleRow.length, true)
            .string(period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(30);


        const headerStyle = wb.createStyle({
            font: { bold: true, size: 10 },
            alignment: { horizontal: 'center', vertical: 'center' },
            fill: { type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0' },
            border : {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const achatsColSpan = 10 - (filter.merchant ? 1 : 0); // Ajuster si le champ "Client" est inclus
        const reglementsColSpan = 3;
        ws.cell(4, 1, 4, achatsColSpan, true).string('Achats').style(headerStyle);
        ws.cell(4, achatsColSpan + 1, 4, achatsColSpan + reglementsColSpan, true).string('Règlements').style(headerStyle);

        const tableWidth = 100;
        const columnCount = titleRow.length;
        const columnWidth = Math.floor(tableWidth / columnCount);
        titleRow.forEach((title, index) => {
            ws.cell(5, index + 1).string(title).style(headerStyle);
            ws.column(index + 1).setWidth(columnWidth);
        });
        const rowStyle = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });
        const rowStyleRight = wb.createStyle({
            font: { size: 9 },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
                left: { style: 'thin', color: '#000000' },
                right: { style: 'thin', color: '#000000' },
                top: { style: 'thin', color: '#000000' },
                bottom: { style: 'thin', color: '#000000' }
            }
        });

        let rowIndex = 6;
        const filteredData = data.filter(transaction => {
            return (!filter.merchant || transaction.merchant?.id === filter.merchant) &&
                (!filter.article || transaction.article?.id === filter.article);
        });
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        const groupedByDate = _.groupBy(filteredData, item => item.date);


        let totalPriceSum = 0;
        let totalQuantitySum = 0;
        let totalWeightSum = 0;
        let totalToPayByMerchantSum =0;
        let totalmerchantCommissionSum  =0;
        let totalMerchantPaymentSum =0;

        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const groupedByProducer = _.groupBy(dateGroup, item => item.sale.producerName);
            let isFirstDateRow = true;
            Object.keys(groupedByProducer).forEach(producer => {
                const producerGroup = groupedByProducer[producer];
                const groupedByMerchant = _.groupBy(producerGroup, item => item.merchant?.name);
                let isFirstProducerRow = true;
                Object.keys(groupedByMerchant).forEach(merchant => {
                    const merchantGroup = groupedByMerchant[merchant];
                    const groupedByArticle = _.groupBy(merchantGroup, item => item.article?.name);
                    let isFirstMerchantRow = true;
                    Object.keys(groupedByArticle).forEach(article => {
                        const articleGroup = groupedByArticle[article];

                        articleGroup.forEach((transaction, index) => {
                            totalQuantitySum += transaction.boxes || 0;
                            totalWeightSum += transaction.netWeight || 0;
                            totalPriceSum += transaction.totalPrice || 0;
                            totalmerchantCommissionSum += transaction.merchantCommission || 0;
                            totalToPayByMerchantSum += transaction.totalToPayByMerchant || 0;
                            totalMerchantPaymentSum +=transaction.totalMerchantPayment || 0;

                            if (isFirstDateRow) {
                                ws.cell(rowIndex, 1, rowIndex + dateGroup.length - 1, 1, true)
                                    .string(transaction.date || "Non spécifié")
                                    .style(rowStyle);
                                ws.column(1).setWidth(8);
                                isFirstDateRow = false;
                            }
                            if (isFirstProducerRow) {
                                ws.cell(rowIndex, 2, rowIndex + producerGroup.length - 1, 2, true).string(transaction.sale.producerName.toUpperCase() || "Non spécifié").style(rowStyle);
                                ws.column(2).setWidth(15);
                                isFirstProducerRow = false;
                            }

                            if (!filter.merchant) {
                                if (isFirstMerchantRow) {
                                    ws.cell(rowIndex, 3, rowIndex + merchantGroup.length - 1, 3, true).string(transaction.merchant?.name.toUpperCase() || "Non spécifié").style(rowStyle);
                                    ws.column(3).setWidth(15);
                                    isFirstMerchantRow = false;
                                }
                            }

                            let colIndex = 3;
                            if (!filter.merchant) colIndex += 1;
                            ws.cell(rowIndex,colIndex,rowIndex + articleGroup.length - 1, colIndex, true).string(transaction.article?.name.toUpperCase() || "Non spécifié").style(rowStyle);
                            ws.column(rowIndex,colIndex).setWidth(15);
                            ws.cell(rowIndex, colIndex+ 1).number(transaction.boxes || 0).style(rowStyle);
                            ws.cell(rowIndex, colIndex + 2).number(transaction.netWeight || 0).style(rowStyle);
                            ws.cell(rowIndex, colIndex + 3).string(transaction.unitPrice.toLocaleString("fr-TN", {style: "decimal", minimumFractionDigits: 2}) || "0.00").style(rowStyleRight);
                            ws.column(colIndex+ 3).setWidth(9);
                            ws.cell(rowIndex, colIndex + 4).string(transaction.totalPrice.toLocaleString("fr-TN", {style: "decimal", minimumFractionDigits: 2}) || "0.00").style(rowStyleRight);
                            ws.cell(rowIndex, colIndex + 5).string(transaction.merchantCommission.toLocaleString("fr-TN", {style: "decimal", minimumFractionDigits: 2}) || "0.00").style(rowStyleRight);
                            ws.cell(rowIndex, colIndex + 6).string(transaction.totalToPayByMerchant.toLocaleString("fr-TN", {style: "decimal", minimumFractionDigits: 2}) || "0.00").style(rowStyleRight);
                            ws.cell(rowIndex, colIndex + 7).string(transaction.totalMerchantPayment.toLocaleString("fr-TN", {style: "decimal", minimumFractionDigits: 2}) || "0.00").style(rowStyleRight);
                            ws.cell(rowIndex, colIndex + 8).string(transaction.paymentInfo?.name || 'Non spécifié').style(rowStyle);
                            ws.column(rowIndex, colIndex + 8).setWidth(15);
                            ws.cell(rowIndex, colIndex + 9).string(transaction.receiptNumber|| '0').style(rowStyle);
                            rowIndex++;

                        });
                    });
                });
            });
        });

        let totalStartCol = 1;
        let totalEndCol = 4;
        if (filter.merchant) totalEndCol -= 1;
        const totalStyle = wb.createStyle({
            font: { size: 10, bold: true },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        });
        const totalPriceStyle = wb.createStyle({
            font: { size: 10, bold: true },
            alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        });
        ws.cell(rowIndex, totalStartCol, rowIndex, totalEndCol, true).string('Total').style(totalStyle);
        const totalData = [totalQuantitySum, totalWeightSum, '', totalToPayByMerchantSum.toLocaleString('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 2 }),totalmerchantCommissionSum.toLocaleString('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 2 }),totalPriceSum.toLocaleString('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 2 }),totalMerchantPaymentSum.toLocaleString('fr-TN', { style: 'currency', currency: 'TND', minimumFractionDigits: 2 }),'',''];
        totalData.forEach((value, colIndex) => {
            ws.cell(rowIndex,  totalEndCol + 1 + colIndex)
                .string(value.toString())
                .style(totalPriceStyle);
        });

        const fileName = "etatDuCommercant.xlsx";
        const excelFile = tools.Excel_PATH;
        if (!fs.existsSync(excelFile)) {
            fs.mkdirSync(excelFile, {recursive: true});
        }
        const filePath = path.join(excelFile, fileName);

        wb.write(filePath,function (err, stats){
            if (err) {
                console.error("Error generating Excel file:", err);
                return res.status(500).send('Error generating Excel file');
            }
            res.status(201).json(new Response(fileName));
            res.download(filePath);
        });
    } catch (err) {
        console.error("Erreur lors de la génération du fichier Excel:", err);
        res.status(500).json({ success: false, message: err.message });
    }

};
module.exports = router;
