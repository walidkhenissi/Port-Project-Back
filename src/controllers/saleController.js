var router = require('express').Router();
const dao = require("../dao/saleDao");
const shipOwnerDao = require("../dao/shipOwnerDao");
const balanceController = require("../controllers/balanceController");
const salePaymentDao = require("../dao/salePaymentDao");
const boatDao = require("../dao/boatDao");
const salesTransactionDao = require("../dao/salesTransactionDao");
const Response = require("../utils/response");
const {Merchant, CommissionValue, Commission, SalesTransaction, PaymentInfo,Article} = require("../models");
const boxesTransactionController = require("./boxesTransactionController");
const fs = require("fs");
const path = require("path");
const PdfPrinter = require("pdfmake");
const XLSX = require("xlsx");

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
    try
    {
    const dataToReport = await router.getSalesReportData(req.body);
    if (req.body.excelType){
        router.generateExcelSalesReport(dataToReport, res);
    }else if (req.body.pdfType){
        router.generatePDFSalesReport(dataToReport, res);
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

router.generatePDFSalesReport = async function (data, res) {

    let titleRow = [];
    titleRow.push([
        {text: 'Date', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee' },
        {text: 'Producteur', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Article ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Quantite  ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Poid Net ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Prix Total ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Comission Prod', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Commercant', fontSize: 12, alignment: 'center',bold: true ,fillColor: '#eeeeee'},
        {text: 'Prix Unite', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Commission Com', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee' },
        {text: 'Total a payer ', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'},
        {text: 'Total Net', fontSize: 12, alignment: 'center',bold: true,fillColor: '#eeeeee'}
    ]);
    let salesReportData = [];
    let sousTotal=0;
    for (const sale of data) {
        for (const transaction of sale.saleTransactions) {
            salesReportData.push([
            { text: sale.date, fontSize: 10, alignment: 'center' },
            { text: sale.producerName, fontSize: 10, alignment: 'center' },
            { text: transaction.article ? transaction.article.name : 'Non spécifié', fontSize: 10, alignment: 'center' },
            { text: transaction.boxes, fontSize: 10, alignment: 'center' },
            { text: transaction.netWeight, fontSize: 10, alignment: 'center' },
            { text: transaction.totalPrice.toLocaleString('fr-TN',{ style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }), fontSize: 10, alignment: 'center' },
            { text: sale.totalProducerCommission.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }), fontSize: 10, alignment: 'center' },
            { text: transaction.merchant ? transaction.merchant.name:'Non spécifié', fontSize: 10, alignment: 'center'},
            { text: transaction.unitPrice, fontSize: 10, alignment: 'center' },
            { text: sale.totalMerchantCommission.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }), fontSize: 10, alignment: 'center' },
            { text: sale.totalToPay.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }), fontSize: 10, alignment: 'center' },
            { text: sale.total.toLocaleString('fr-TN', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }), fontSize: 10, alignment: 'center' }
            ]);
        }
    }

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
        text: 'État des Ventes',  fontSize: 22, alignment: 'center', margin: [0, 20]
    });
    docDefinition.content.push({
        columns: [
            {
                table: {
                    body: [
                    ...titleRow,
                    ...salesReportData],
        widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']
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

router.generateExcelSalesReport = async function (data, res) {
   try{
    const title = `État des Ventes `;
       const columns = [
           { header: 'Date', key: 'date', width: 20 },
           { header: 'Producteur', key: 'producerName', width: 25 },
           { header: 'Article', key: 'article', width: 30 },
           { header: 'Quantité', key: 'quantites', width: 15 },
           { header: 'Poid Net', key: 'netWeight', width: 15 },
           { header: 'Prix Unitaire', key: 'unitPrice', width: 15 },
           { header: 'Prix Total', key: 'totalPrice', width: 20 },
           { header: 'Commission Producteur', key: 'totalProducerCommission', width: 20 },
           { header: 'Commerçant', key: 'merchant', width: 25 },
           { header: 'Commission Commerçant', key: 'totalMerchantCommission', width: 20 },
           { header: 'Total à Payer', key: 'totalToPay', width: 20 },
           { header: 'Total Net', key: 'total', width: 20 }
       ];
    let salesReportData = data.flatMap(sale =>
        sale.saleTransactions.map(transaction => ({
            date: sale.date,
            producerName: sale.producerName,
            article: transaction.article ? transaction.article.name : 'Non spécifié',
            quantites:transaction.boxes,
            netWeight:transaction.netWeight,
            unitPrice: transaction.unitPrice,
            totalPrice : transaction.totalPrice,
            totalProducerCommission: sale.totalProducerCommission,
            merchant: transaction.merchant ? transaction.merchant.name: 'Non spécifié',
            totalMerchantCommission: sale.totalMerchantCommission,
            totalToPay: sale.totalToPay,
            total: sale.total
        }))
    );

    const worksheet = XLSX.utils.json_to_sheet(salesReportData, { header: columns.map(col => col.key) });
    const headerRow = worksheet['A1'] && worksheet['B1'];
     columns.forEach((col, index) => {
           const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: index })];
           if (cell) {
               cell.s = { font: { bold: true } }; // Appliquer le style gras
           }
       });

    worksheet['!cols'] = columns.map(col => ({ wch: col.width}));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title);
   fileName = "excelFile.xlsx";

   const excelFile=tools.PDF_PATH;
    if (!fs.existsSync(excelFile)) {
        fs.mkdirSync(excelFile, { recursive: true });
    }
    const filePath = path.join(excelFile,fileName);

        XLSX.writeFile(workbook, filePath);
        res.status(201).json(new Response(fileName));
} catch (error) {
    console.error("Erreur lors de la génération du fichier Excel :", error);
    res.status(500).json({ success: false, message: error.message });
}

};


module.exports = router;
