var router = require('express').Router();
const dao = require("../dao/saleDao");
const shipOwnerDao = require("../dao/shipOwnerDao");
const balanceController = require("../controllers/balanceController");
const salePaymentDao = require("../dao/salePaymentDao");
const boatDao = require("../dao/boatDao");
const salesTransactionDao = require("../dao/salesTransactionDao");
const Response = require("../utils/response");
const {Merchant, Shipowner,CommissionValue, Commission, SalesTransaction, PaymentInfo,Article} = require("../models");
const boxesTransactionController = require("./boxesTransactionController");
const fs = require("fs");
const path = require("path");
const PdfPrinter = require("pdfmake");
const ExcelJS = require('exceljs');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving sale :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const whereCriteria1 = _.clone(criteria.where);
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        const sum = await dao.sum({where: whereCriteria1});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        response.metaData.sum = sum;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving sale :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving sale :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const sale = req.body;
    try {
        if (!sale.shipOwnerId && !sale.merchantId)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!sale.date)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        const saleNumber = await dao.nextSaleNumber(sale);
        sale.number = moment(sale.date).format('YY').concat('_').concat(saleNumber.toString().padStart(6, '0'));
        sale.producerName = await router.getProducerName(sale);
        const boatRef = await router.getBoatReference(sale);
        if (!tools.isFalsey(boatRef))
            sale.boatReference = boatRef;
        sale.name = await router.buildSaleName(sale);
        const paymentInfo = await PaymentInfo.findOne({where: {reference: 'NOT_PAYED'}});
        if (!paymentInfo) {
            throw new Error('No payment Info definition Error');
            return;
        }
        sale.paymentInfoId = paymentInfo.id;
        sale.total = 0;
        sale.totalToPay = 0;
        sale.restToPay = 0;
        sale.totalPaid = 0;
        sale.totalProducerCommission = 0;
        sale.totalMerchantCommission = 0;
        const created = await dao.create(sale);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating sale :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const sale = req.body;
    try {
        if (!sale.id)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!sale.shipOwnerId && !sale.merchantId)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!sale.date)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        const updated = await router.update(sale);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating sale :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.update = async function (sale) {
    try {
        const oldSale = await dao.get(sale.id);
        sale = await router.calculateValues(sale);
        sale.name = await router.buildSaleName(sale);
        let criteriaRef;
        if (sale.totalPaid == 0) {
            criteriaRef = {reference: 'NOT_PAYED'};
        } else if (sale.restToPay == 0) {
            criteriaRef = {reference: 'PAYED'};
        } else {
            criteriaRef = {reference: 'PARTIALLY_PAYED'};
        }
        const paymentInfo = await PaymentInfo.findOne({where: criteriaRef});
        if (!paymentInfo) {
            throw new Error('No payment Info definition Error');
            return;
        }
        sale.paymentInfoId = paymentInfo.id;
        const updated = await dao.update(sale);
        if (!moment(oldSale.date).isSame(sale.date)) {
            for (const key in oldSale.saleTransactions) {
                const saleTransaction = oldSale.saleTransactions[key];
                saleTransaction.date = sale.date;
                await salesTransactionDao.update(saleTransaction);
            }
        }
        await boxesTransactionController.persistBySale(oldSale);
        await boxesTransactionController.persistBySale(updated);
        if (oldSale.shipOwnerId && !sale.shipOwnerId)
            await balanceController.updateByShipOwnerAsProducer(oldSale.shipOwnerId, oldSale.date);
        if (!oldSale.shipOwnerId && sale.shipOwnerId)
            await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        if (oldSale.shipOwnerId && sale.shipOwnerId && oldSale.shipOwnerId == sale.shipOwnerId)
            await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        if (oldSale.shipOwnerId && sale.shipOwnerId && (oldSale.shipOwnerId != sale.shipOwnerId)) {
            await balanceController.updateByShipOwnerAsProducer(oldSale.shipOwnerId, oldSale.date);
            await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        }
        if (oldSale.merchantId && !sale.merchantId)
            await balanceController.updateMerchantBalance(oldSale.merchantId, oldSale.date);
        if (!oldSale.merchantId && sale.merchantId)
            await balanceController.updateMerchantBalance(sale.merchantId, sale.date);
        if (oldSale.merchantId && sale.merchantId && oldSale.merchantId == sale.merchantId)
            await balanceController.updateMerchantBalance(sale.merchantId, sale.date);
        if (oldSale.merchantId && sale.merchantId && (oldSale.merchantId != sale.merchantId)) {
            await balanceController.updateMerchantBalance(oldSale.merchantId, oldSale.date);
            await balanceController.updateMerchantBalance(sale.merchantId, sale.date);
        }
        return updated;
    } catch (error) {
        console.error('Error updating sale :', error);
        throw error;
    }
}

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const persistedSale = await dao.get(id);
        if (persistedSale.saleTransactions.length)
            return res.status(404).json(new Response({errorCode: '#ATTACHED_SALES_TRANSACTIONS'}, true));
        let salePayments = await salePaymentDao.find({where: {saleId: id}});
        if (salePayments.length)
            return res.status(404).json(new Response({errorCode: '#ATTACHED_PAYMENTS'}, true));
        const salesTransactionsIds = _.keys(_.keyBy(persistedSale.saleTransactions, 'id')).map(Number)
        //Deleting salesTransation's commissionValues
        await CommissionValue.destroy({where: {salesTransactionId: salesTransactionsIds}});
        const removed = await dao.remove(id);
        //All sales transactions will be automatically deleted
        await boxesTransactionController.persistBySale(persistedSale);
        //Update producer Balance if is a merchant
        if (persistedSale.merchantId)
            await balanceController.updateMerchantBalance(persistedSale.merchantId, persistedSale.date);
        //Update producer Balance if is a shipOwner
        if (persistedSale.shipOwnerId)
            await balanceController.updateByShipOwnerAsProducer(persistedSale.shipOwnerId, persistedSale.date);
        // Update merchant balances for all sales transactions
        for (let item in persistedSale.saleTransactions) {
            const saleTransaction = persistedSale.saleTransactions[item];
            await balanceController.updateMerchantBalance(saleTransaction.merchantId, persistedSale.date);
        }
        // Update commission's beneficiaries balances
        await balanceController.updateBeneficiaryCommissionsBalance(persistedSale.date);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing sale :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/getSaleWithDetails', async (req, res) => {
    const id = req.query.id;
    try {
        const commissionController = require("../controllers/commissionController");
        const sale = await dao.get(id);
        const saleTransactionIds = _.keys(_.keyBy(sale.saleTransactions, 'id')).map(Number);
        const commissionValues = await CommissionValue.findAll({
            where: {salesTransactionId: saleTransactionIds},
        });
        const availableCommissions = await commissionController.getAvailableCommissionsAtDate(sale.date);
        res.status(201).json(new Response({
            sale: sale,
            commissionValues: commissionValues,
            availableCommissions: availableCommissions
        }));
    } catch (error) {
        console.error('Error retrieving sale :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.getProducerName = async function (sale) {
    let producer;
    if (sale.shipOwnerId)
        producer = await shipOwnerDao.get(sale.shipOwnerId);
    else if (sale.merchantId)
        producer = await Merchant.findByPk(sale.merchantId);
    if (producer)
        return producer.firstName + ' ' + producer.lastName;
    throw new Error('Cant determinate producer name');
}
router.getBoatReference = async function (sale) {
    let boat, ref;
    if (sale.boatId)
        boat = await boatDao.get(sale.boatId);
    if (boat) {
        ref = boat.name;
        if (boat.serialNumber)
            ref += ' | ' + boat.serialNumber;
    }
    return ref;
}
router.buildSaleName = async function (sale) {
    let name = '';
    if (!tools.isFalsey(sale.producerName))
        name = name.concat(sale.producerName);
    if (!tools.isFalsey(sale.boatReference)) {
        if (name.length > 0)
            name = name.concat('_');
        name = name.concat(sale.boatReference);
    }
    if (!tools.isFalsey(sale.date)) {
        if (name.length > 0)
            name = name.concat('_');
        name = name.concat(moment(sale.date).format('YYYY-MM-DD'));
    }
    if (!tools.isFalsey(sale.totalToPay)) {
        if (name.length > 0)
            name = name.concat('_');
        name = name.concat(sale.totalToPay + ' TND');
    }
    return name;
}
router.calculateValues = async function (sale) {
    sale.producerName = await router.getProducerName(sale);
    const boatRef = await router.getBoatReference(sale);
    if (!tools.isFalsey(boatRef))
        sale.boatReference = boatRef;
    const commissionController = require("../controllers/commissionController");
    sale = await commissionController.calculateSaleCommissions(sale);
    const saleTransactions = await salesTransactionDao.list({where: {saleId: sale.id}});
    sale.total = Number(parseFloat(_.sumBy(saleTransactions, 'totalPrice')).toFixed(3));
    sale.totalProducerCommission = Number(parseFloat(_.sumBy(saleTransactions, 'producerCommission')).toFixed(3));
    sale.totalMerchantCommission = Number(parseFloat(_.sumBy(saleTransactions, 'merchantCommission')).toFixed(3));
    sale.totalToPay = Number(parseFloat(sale.total - sale.totalProducerCommission).toFixed(3));
    sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
    return sale;
}

router.checkPaymentInfo = async function (sale) {
    sale.totalToPay = Number(parseFloat(sale.totalToPay || 0).toFixed(3));
    if (tools.isFalsey(sale.totalPaid))
        sale.totalPaid = 0;
    sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
    let criteriaRef;
    if (sale.totalPaid == 0) {
        criteriaRef = {reference: 'NOT_PAYED'};
    } else if (sale.restToPay == 0) {
        criteriaRef = {reference: 'PAYED'};
    } else {
        criteriaRef = {reference: 'PARTIALLY_PAYED'};
    }
    // console.log("=====================>sale : " + JSON.stringify(sale));
    const paymentInfo = await PaymentInfo.findOne({where: criteriaRef});
    if (!paymentInfo) {
        throw new Error('No payment Info definition Error');
        return;
    }
    sale.paymentInfoId = paymentInfo.id;
    return sale;
}


router.post('/generateSalesReport', async (req, res) => {
    const { startDate, endDate, producer, merchant, article } = req.body;
    try
    {
    const dataToReport = await router.getSalesReportData(req.body);
    if (req.body.excelType){
        router.generateExcelSalesReport(dataToReport,req.body, res);
    }else if (req.body.pdfType){
        router.generatePDFSalesReport(dataToReport,req.body, res);
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

router.getSalesReportData = async function (options) {
    let criteria = {where: {}};
    if (!tools.isFalsey(options.dateRule)) {
        switch (options.dateRule) {
            case 'equals' : {
               // criteria.where.date = new Date(options.startDate);
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
    if (options.producer)
        criteria.where.shipOwnerId = options.producer;
    let sales = await dao.find(criteria);
    let availableSales = [];
    for (const sale of sales) {
        let _criteria = {where: {saleId: sale.id}};
        if (!tools.isFalsey(options.merchant))
            _criteria.where.merchantId = options.merchant;
        if (!tools.isFalsey(options.article))
            _criteria.where.articleId = options.article;
        sale.saleTransactions = await salesTransactionDao.find(_criteria);

        if (sale.saleTransactions && sale.saleTransactions.length)
            availableSales.push(sale);
    }
    sales = availableSales;
    return sales;
}

router.generatePDFSalesReport = async function (data, filter,res) {
    const { startDate, endDate, producer, merchant, article } = filter;
    let hideProducer = !data.some(sale => sale.producerName);
    let hideMerchant = !data.some(sale => sale.saleTransactions.some(transaction => transaction.merchant));
    let hideArticle = !data.some(sale => sale.saleTransactions.some(transaction => transaction.article));

    let titleRow = [];
    titleRow.push([
        {text: 'Date', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee' },
        ...(!hideProducer ?  [{text: 'Producteur', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'}] : []),
        ...(!hideArticle ? [{text: 'Article ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'}] : []),
        ...(!hideMerchant ?  [{text: 'Commercant', fontSize: 12, alignment: 'center',bold: true ,fillColor: '#eeeeee'}] : []),
        {text: 'Prix Unite', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Quantite  ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Poid Net ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Prix Total ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Comission Prod', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Commission Com', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee' },
        {text: 'Total a payer ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Total Net', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'}
    ]);
    let salesReportData = [];
    let totalMerchantCommissionSum = 0;
    let totalProducerCommissionSum=0;
    let totalToPaySum =0;
    let totalSum =0;
    let totalQuantitySum=0;
    let totalWeightSum =0;
    let totalPriceSum =0;

    for (const sale of data) {
        totalMerchantCommissionSum += sale.totalMerchantCommission;
        totalProducerCommissionSum += sale.totalProducerCommission;
        totalToPaySum +=sale.totalToPay;
        totalSum += sale.total;
        for (const transaction of sale.saleTransactions) {
            totalQuantitySum +=transaction.boxes;
            totalWeightSum +=transaction.netWeight;
            totalPriceSum += transaction.totalPrice;
            salesReportData.push([
                {text: sale.date, fontSize: 10, alignment: 'center', rowSpan: sale.saleTransactions.length},
                ...(!hideProducer ? [{
                    text: sale.producerName,
                    fontSize: 10,
                    alignment: 'center',
                    rowSpan: sale.saleTransactions.length
                }] : []),
                ...(!hideArticle ? [{
                    text: transaction.article ? transaction.article.name : 'Non spécifié',
                    fontSize: 10,
                    alignment: 'center',
                }] : []),
                ...(!hideMerchant ? [{
                    text: transaction.merchant?.name || 'Non spécifié',
                    fontSize: 10,
                    alignment: 'center'
                }] : []),
                {text: transaction.unitPrice, fontSize: 10, alignment: 'center'},
                {text: transaction.boxes, fontSize: 10, alignment: 'center'},
                {text: transaction.netWeight, fontSize: 10, alignment: 'center'},
                {text: transaction.totalPrice, fontSize: 10, alignment: 'center'},
                { text: sale.totalProducerCommission,fontSize: 10, alignment: 'center',rowSpan: sale.saleTransactions.length},
                {text: sale.totalMerchantCommission.toLocaleString('fr-TN', {
                        style: 'decimal',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }), fontSize: 10, alignment: 'center', rowSpan: sale.saleTransactions.length
                },
                {text: sale.totalToPay.toLocaleString('fr-TN', {
                        style: 'decimal',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }), fontSize: 10, alignment: 'center', rowSpan: sale.saleTransactions.length
                },
                {
                    text: sale.total.toLocaleString('fr-TN', {
                        style: 'decimal',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }), fontSize: 10, alignment: 'center', rowSpan: sale.saleTransactions.length
                }

            ]);
        }
    }

salesReportData.push([
    { text: 'Total', fontSize: 10, alignment: 'center', bold: true,colSpan: 5},
    ...(!hideProducer ? [''] : []),
    ...(!hideArticle ? [''] : []),
    '', '',
    { text: totalQuantitySum, fontSize: 10, alignment: 'center', bold: true },
    { text: totalWeightSum, fontSize: 10, alignment: 'center', bold: true },
    { text: totalPriceSum.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }), fontSize: 10, alignment: 'center', bold: true },
    { text: totalProducerCommissionSum.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }), fontSize: 10, alignment: 'center', bold: true },
    { text: totalMerchantCommissionSum.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }), fontSize: 10, alignment: 'center', bold: true },
    { text: totalToPaySum.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }), fontSize: 10, alignment: 'center', bold: true },
    { text: totalSum.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2 }), fontSize: 10, alignment: 'center', bold: true },
]);

    let period = '';
    switch (filter.dateRule) {
        case 'equals': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Date exacte : ${formattedDate}` : 'Date exacte non spécifiée';
            break;
        }
        case 'notEquals': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Exclure la date : ${formattedDate}` : 'Date à exclure non spécifiée';
            break;
        }
        case 'lowerThan': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Avant le : ${formattedDate}` : 'Date limite non spécifiée';
            break;
        }
        case 'greaterThan': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Après le : ${formattedDate}` : 'Date de début non spécifiée';
            break;
        }
        case 'between': {
            const formattedStartDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            const formattedEndDate = filter.endDate
                ? new Date(filter.endDate).toLocaleDateString('fr-TN')
                : null;

            if (formattedStartDate && formattedEndDate) {
                period = `Période : ${formattedStartDate} à ${formattedEndDate}`;
            } else if (formattedStartDate) {
                period = `À partir de : ${formattedStartDate}`;
            } else if (formattedEndDate) {
                period = `Jusqu'à : ${formattedEndDate}`;
            } else {
                period = 'Période non spécifiée';
            }
            break;
        }
        default: {
            period = '';
        }
    }

    let producerName = '';
    if (producer) {
            const producerData = await Shipowner.findByPk(producer);
            producerName = producerData ? `Producteur : ${producerData.name}` : '';
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
    let reportTitle = 'Etat des ventes';
    let additionalParts = [];
    if (producerName) additionalParts.push(producerName);
    if (articleName) additionalParts.push(articleName);
    if (merchantName) additionalParts.push(merchantName);

    if (period) {
        reportTitle +=  '\n' + additionalParts.join(' | ') + '\n' + period;
    } else if (additionalParts.length > 0) {
        reportTitle +=  ':'+additionalParts.join(' | ');
    }


    let generationDate = `Edité le  : ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`;

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'landscape',
        defaultStyle: {
            fontSize: 5,
            columnGap: 20
        },
        content: []
    };
    docDefinition.content.push({
        text: reportTitle,
        fontSize: 22,
        alignment: 'center',
        margin: [0, 20]
    });

    docDefinition.content.push({
        text: generationDate,
        fontSize: 10,
        alignment: 'right',
        margin: [0, 0, 0, 10]
    });
    docDefinition.content.push({
        columns: [
            {
                table: {
                    body: [
                    ...titleRow,
                    ...salesReportData],
        widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*', '*', '*', '*', 'auto', 'auto', 'auto']
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

    fileName = "pdfFile.pdf";
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

router.generateExcelSalesReport = async function (data,filter, res) {
    const { startDate, endDate, producer, merchant, article } = filter;
try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report', {
        pageSetup: { paperSize: 9, orientation: 'landscape' },
    });


    const generationDate = `Date de génération : ${new Date().toLocaleDateString("fr-FR")}`;

    let period = '';
    switch (filter.dateRule) {
        case 'equals': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Date exacte : ${formattedDate}` : 'Date exacte non spécifiée';
            break;
        }
        case 'notEquals': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Exclure la date : ${formattedDate}` : 'Date à exclure non spécifiée';
            break;
        }
        case 'lowerThan': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Avant le : ${formattedDate}` : 'Date limite non spécifiée';
            break;
        }
        case 'greaterThan': {
            const formattedDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            period = formattedDate ? `Après le : ${formattedDate}` : 'Date de début non spécifiée';
            break;
        }
        case 'between': {
            const formattedStartDate = filter.startDate
                ? new Date(filter.startDate).toLocaleDateString('fr-TN')
                : null;
            const formattedEndDate = filter.endDate
                ? new Date(filter.endDate).toLocaleDateString('fr-TN')
                : null;

            if (formattedStartDate && formattedEndDate) {
                period = `Période : ${formattedStartDate} à ${formattedEndDate}`;
            } else if (formattedStartDate) {
                period = `À partir de : ${formattedStartDate}`;
            } else if (formattedEndDate) {
                period = `Jusqu'à : ${formattedEndDate}`;
            } else {
                period = 'Période non spécifiée';
            }
            break;
        }
        default: {
            period = '';
        }
    }
    let producerName = '';
    if (producer) {
        const producerData = await Shipowner.findByPk(producer);
        producerName = producerData ? `Producteur : ${producerData.name}` : '';
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
    let reportTitle = 'Etat des ventes';
    let additionalParts = [];
    if (producerName) additionalParts.push(producerName);
    if (articleName) additionalParts.push(articleName);
    if (merchantName) additionalParts.push(merchantName);

    if (period) {
        reportTitle +=  '\n' + additionalParts.join(' | ') + '\n' + period;
    } else if (additionalParts.length > 0) {
        reportTitle +=  ':'+additionalParts.join(' | ');
    }
    worksheet.mergeCells('A1:L1');
    worksheet.getCell('A1').value = reportTitle;
    worksheet.getCell('A1').font = { size: 14, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    worksheet.getRow(1).height = 80;

    worksheet.mergeCells('A2:L2');
    worksheet.getCell('A2').value = generationDate;
    worksheet.getCell('A2').alignment = { horizontal: 'right' };


    const headers = [
        'Date',
        'Producteur' ,
        'Article',
        'Commerçant',
        'Prix Unité',
        'Quantité',
        'Poids Net',
        'Prix Total',
        'Com. Prod',
        'Com. Com',
        'Total à Payer',
        'Total Net',
    ];
    worksheet.addRow(headers);
    worksheet.getRow(3).eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEEEEE' } };
    });

    for (const sale of data) {
        for (const transaction of sale.saleTransactions) {
            const row = [
                sale.date,
                sale.producerName,
                transaction.article?.name || 'Non spécifié',
                transaction.merchant?.name || 'Non spécifié',
                transaction.unitPrice,
                transaction.boxes,
                transaction.netWeight,
                transaction.totalPrice,
                sale.totalProducerCommission,
                sale.totalMerchantCommission,
                sale.totalToPay,
                sale.total,
            ];
            worksheet.addRow(row);
        }
    }

    // Ajuster la largeur des colonnes
    worksheet.columns.forEach((column, index) => {
        column.width = headers[index]?.length + 5 || 15;
    });


    worksheet.addRow([
        'Total',
        ...new Array(headers.length - 8).fill(''),
        data.reduce((sum, sale) => sum + sale.saleTransactions.reduce((s, t) => s + t.boxes, 0), 0),
        data.reduce((sum, sale) => sum + sale.saleTransactions.reduce((s, t) => s + t.netWeight, 0), 0),
        data.reduce((sum, sale) => sum + sale.saleTransactions.reduce((s, t) => s + t.totalPrice, 0), 0),
        data.reduce((sum, sale) => sum + sale.totalProducerCommission, 0),
        data.reduce((sum, sale) => sum + sale.totalMerchantCommission, 0),
        data.reduce((sum, sale) => sum + sale.totalToPay, 0),
        data.reduce((sum, sale) => sum + sale.total, 0),
    ]);


   const fileName = "excelFile.xlsx";

   const excelFile=tools.Excel_PATH;
    if (!fs.existsSync(excelFile)) {
        fs.mkdirSync(excelFile, { recursive: true });
    }
    const filePath = path.join(excelFile,fileName);

       await workbook.xlsx.writeFile(filePath);
        res.status(201).json(new Response(fileName));
} catch (error) {
    console.error("Erreur lors de la génération du fichier Excel :", error);
    res.status(500).json({ success: false, message: error.message });
}

};


module.exports = router;
