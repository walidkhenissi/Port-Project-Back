var router = require('express').Router();
const dao = require("../dao/saleDao");
const shipOwnerDao = require("../dao/shipOwnerDao");
const balanceController = require("../controllers/balanceController");
const salePaymentDao = require("../dao/salePaymentDao");
const boatDao = require("../dao/boatDao");
const salesTransactionDao = require("../dao/salesTransactionDao");
const Response = require("../utils/response");
const {
    Merchant,
    Shipowner,
    CommissionValue,
    PaymentInfo,
    Sale, SalesTransaction
} = require("../models");
const boxesTransactionController = require("./boxesTransactionController");
const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const xl = require("excel4node");
const {Op} = require("sequelize");
moment.locale('fr');

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
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        const sum = await dao.sum({where: {id: _.map(data, 'id')}});
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
        // if (tools.isFalsey(sale.receiptNumber))
        //     return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
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
        if (tools.isFalsey(sale.receiptNumber) || sale.receiptNumber == 0) {
            sale.receiptNumber = null;
        }
        if (!tools.isFalsey(sale.receiptNumber)) {
            const found = await Sale.findOne({where: {receiptNumber: sale.receiptNumber}});
            if (found) {
                return res.status(404).json(new Response({errorCode: '#FOUND_RECEIPT_NUMBER_ERROR'}, true));
            }
        }
        sale.paymentInfoId = paymentInfo.id;
        sale.total = 0;
        sale.totalToPay = 0;
        sale.restToPay = 0;
        sale.totalPaid = 0;
        sale.totalProducerCommission = 0;
        sale.totalMerchantCommission = 0;
        sale.date = tools.refactorDate(sale.date);
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
        // if (tools.isFalsey(sale.receiptNumber))
        //     return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (tools.isFalsey(sale.receiptNumber) || sale.receiptNumber == 0) {
            sale.receiptNumber = null;
        }
        if (!tools.isFalsey(sale.receiptNumber)) {
            const found = await Sale.findOne({where: {id: {[Op.ne]: sale.id}, receiptNumber: sale.receiptNumber}});
            if (found) {
                return res.status(404).json(new Response({errorCode: '#FOUND_RECEIPT_NUMBER_ERROR'}, true));
            }
        }
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
        sale.producerName = await router.getProducerName(sale);
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
        sale.date = tools.refactorDate(sale.date);
        const updated = await dao.update(sale);
        if ((!moment(oldSale.date).isSame(sale.date)) || ((!tools.isFalsey(sale.receiptNumber) || !tools.isFalsey(oldSale.receiptNumber)) && sale.receiptNumber != oldSale.receiptNumber)) {
            const commissionController = require("../controllers/commissionController");
            //Update salesTransactions with new values
            await SalesTransaction.update({
                date: sale.date,
                receiptNumber: sale.receiptNumber
            }, {where: {saleId: sale.id}});
            //Update commissionValues with new values
            await CommissionValue.update({
                date: sale.date,
                saleReceiptNumber: sale.receiptNumber
            }, {where: {salesTransactionId: _.uniq(_.map(oldSale.saleTransactions, 'id'))}});
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
        return producer.lastName + ' ' + producer.firstName;
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
    if (!tools.isFalsey(sale.receiptNumber)) {
        if (name.length > 0)
            name = name.concat('_');
        name = name.concat('N°').concat(sale.receiptNumber);
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
    const {startDate, endDate, producer, solde1, solde2} = req.body;
    try {
        const dataToReport = await router.getSalesReportData(req.body);
        const username = req.session.username;
        if (req.body.excelType) {
            router.generateExcelSalesReport(dataToReport, req.body, res, username);
        } else if (req.body.pdfType) {
            router.generatePDFSalesReport(dataToReport, req.body, res, username);
        } else {
            // Si aucun type de fichier n'est spécifié, renvoyez les données sous forme de JSON
            res.status(200).json({
                message: 'Report data fetched successfully',
                data: dataToReport
            });
        }
    } catch (error) {
        console.error('Error generating sales report:', error);

        res.status(500).json({error: 'Error generating report'});
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
    if (options.producer) {
        criteria.where.shipOwnerId = options.producer;
    }
    if (!tools.isFalsey(options.soldeRule) && !tools.isFalsey(options.solde1)) {
        switch (options.soldeRule) {
            case 'equals' : {
                criteria.where.total = options.solde1;
                break;
            }
            case 'notEquals' : {
                criteria.where.total = {'!': options.solde1};
                break;
            }
            case 'lowerThan' : {
                criteria.where.total = {'<=': options.solde1};
                break;
            }
            case 'greaterThan' : {
                criteria.where.total = {'>=': options.solde1};
                break;
            }
            case 'between' : {
                if (!tools.isFalsey(options.solde2)) {
                    criteria.where.total = {'>=': options.solde1, '<=': options.solde2};
                }
                break;
            }
            default:
                break;
        }
    }


    let sales = await dao.find(criteria);


    return sales;
}
router.generateReportTitle = async function (filter, username) {
    const {producer, startDate, endDate, dateRule, soldeRule, solde1, solde2} = filter;
    let title = 'Etats des productions ';
    let reportTitle = [];
    let period = '';
    let montant = '';

    let producerName = '';
    if (producer) {
        const producerData = await Shipowner.findByPk(producer);
        if (producerData) {
            title = `Etat Du Production : ${producerData.name.toUpperCase()}`;
            producerName = producerData.name;
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
    switch (soldeRule) {
        case 'equals':
            montant = solde1 ? `Solde exact : ${solde1}` : 'solde exacte non spécifiée';
            break;
        case 'notEquals':
            montant = solde1 ? `Autre que : ${solde1}` : 'solde à exclure non spécifiée';
            break;
        case 'lowerThan':
            montant = solde1 ? `Solde inférieur à : ${solde1}` : 'Solde limite non spécifiée';
            break;
        case 'greaterThan':
            montant = solde1 ? `Solde Supérieur à : ${solde1}` : 'Solde de départ non spécifiée';
            break;
        case 'between':
            const formattedStart = solde1 ? solde1 : null;
            const formattedEnd = solde2 ? solde2 : null;
            montant = formattedStart && formattedEnd ? `Entre : ${formattedStart} et ${formattedEnd}` : formattedStart ? `À partir de : ${formattedStart}` : formattedEnd ? `Jusqu'à : ${formattedEnd}` : 'Période non spécifiée';
            break;
        default:
            montant = '';
    }
    reportTitle.push(title);

    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;
    return {
        title, reportTitle: reportTitle.join('\n'), period, montant, generationDate
    };
}

router.generatePDFSalesReport = async function (data, filter, res, username) {
    const {title, reportTitle, period, montant, generationDate} = await router.generateReportTitle(filter, username);
    let titleRow = [];
    titleRow.push([
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        !filter.producer ? {
            text: 'Producteur',
            fontSize: 10,
            alignment: 'center',
            bold: true,
            fillColor: '#E8EDF0',
            margin: [0, 3]
        } : null,
        {text: 'N° Bon de vente ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        {text: 'Sous Total ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        {text: 'Commission ', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]},
        {text: 'Total Net', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0', margin: [0, 3]}
    ].filter(Boolean));
    let salesReportData = [];
    let totalProducerCommissionSum = 0;
    let totalSum = 0;
    let totalNetSum = 0;
    const filteredData = data.filter(sale => {
        if (!filter.producer && !filter.solde) return true;
        return (!filter.producer || sale.shipOwnerId === parseInt(filter.producer)) &&
            (!filter.solde || sale.total === filter.solde);
    });

    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    const groupedByDate = _.groupBy(filteredData, item => item.date);

    Object.keys(groupedByDate).forEach(date => {
        const dateGroup = groupedByDate[date];
        const groupedByProducer = _.groupBy(dateGroup, item => item.producerName);
        Object.keys(groupedByProducer).forEach(producer => {
            const producerGroup = groupedByProducer[producer];
            let isFirstRow = true;
            const calculateMargin = (rowSpan, lineHeight = 1.5, fontSize = 9) => {
                const totalRowHeight = rowSpan * fontSize * lineHeight;
                const cellHeight = fontSize;
                const verticalMargin = (totalRowHeight - cellHeight) / 2;
                return [0, verticalMargin, 0, verticalMargin];
            };
            producerGroup.forEach((sale, index) => {
                totalProducerCommissionSum += sale.totalProducerCommission;
                totalNetSum += sale.totalToPay;
                totalSum += sale.total;

                const row = [
                    isFirstRow ? {
                        text: moment(sale.date).format('DD-MM-YYYY'),
                        rowSpan: dateGroup.length,
                        fontSize: 9,
                        alignment: 'center',
                        margin: calculateMargin(dateGroup.length)
                    } : null,
                    !filter.producer ? (isFirstRow ? {
                        text: sale.producerName?.toUpperCase() || "Non spécifié",
                        rowSpan: producerGroup.length,
                        fontSize: 9,
                        alignment: 'center',
                        margin: calculateMargin(producerGroup.length)
                    } : null) : null,
                    {
                        text: sale.receiptNumber, fontSize: 9, alignment: 'center'
                    },
                    {
                        text: sale.total.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right'
                    },
                    {
                        text: sale.totalProducerCommission.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right'
                    },
                    {
                        text: sale.totalToPay.toLocaleString('fr-TN', {
                            style: 'decimal',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }), fontSize: 9, alignment: 'right'
                    }

                ].filter(Boolean);
                salesReportData.push(row);
            });
        });
    });

    salesReportData.push([
        {
            text: 'Total',
            fontSize: 10,
            alignment: 'center',
            bold: true,
            colSpan: filter.producer ? 2 : 3,
            margin: [0, 3]
        },
        ...(filter.producer ? [''] : ['', '']),
        {
            text: totalSum.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }), fontSize: 9, alignment: 'right', bold: true, margin: [0, 3]
        },
        {
            text: totalProducerCommissionSum.toLocaleString('fr-TN', {
                style: 'currency',
                currency: 'TND',
                minimumFractionDigits: 2
            }),
            fontSize: 9,
            alignment: 'right',
            bold: true,
            margin: [0, 3]
        },
        {
            text: totalNetSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}),
            fontSize: 9,
            alignment: 'right',
            bold: true,
            margin: [0, 3]
        }
    ]);

    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'portrait',
        defaultStyle: {
            fontSize: 10,
            columnGap: 20
        },
        content: [
            {
                text: reportTitle,
                fontSize: 14,
                alignment: 'center',
                decoration: 'underline',
                font: 'Roboto',
                bold: true,
                margin: [0, 20, 0, 10]
            },
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 3]},
            {text: montant, fontSize: 14, alignment: 'center', margin: [0, 3]},
            {text: generationDate, fontSize: 10, alignment: 'right', margin: [0, 0, 0, 10]},
            //${username}
            {
                columns: [
                    {
                        table: {
                            body: [...titleRow, ...salesReportData],
                            widths: ['auto', !filter.producer ? 95 : 0, 90, 100, 100, '*'].filter(Boolean)
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

    fileName = "pdfFile.pdf";
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


router.generateExcelSalesReport = async function (data, filter, res, username) {
    try {
        const {
            title,
            reportTitle,
            period,
            montant,
            generationDate
        } = await router.generateReportTitle(filter, username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        const titleRow = ['Date', (!filter.producer ? 'Producteur' : ''), 'N° Bon de vente', 'Total', 'Comission', 'Total Net'].filter(Boolean);

        ws.cell(1, 1, 1, titleRow.length, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, titleRow.length, true)
            .string(reportTitle)
            .style({
                font: {size: 12, bold: true, underline: true},
                alignment: {horizontal: 'center', vertical: 'center'}
            });
        ws.cell(3, 1, 3, titleRow.length, true)
            .string(period)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });
        ws.cell(4, 1, 4, titleRow.length, true)
            .string(montant)
            .style({
                font: {size: 12, italic: true},
                alignment: {horizontal: 'center', vertical: 'center', wrapText: true}
            });


        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const tableWidth = 80;
        const columnCount = titleRow.length;
        const columnWidth = Math.floor(tableWidth / columnCount);

        titleRow.forEach((title, index) => {
            ws.cell(5, index + 1).string(title).style(headerStyle);
            ws.column(index + 1).setWidth(columnWidth);
        });
        const rowStyle = wb.createStyle({
            font: {size: 9},
            alignment: {horizontal: 'center', vertical: 'center'},
            border: {
                left: {style: 'thin', color: '#000000'},
                right: {style: 'thin', color: '#000000'},
                top: {style: 'thin', color: '#000000'},
                bottom: {style: 'thin', color: '#000000'}
            }
        });
        const rowStyleRight = wb.createStyle({
            font: {size: 9},
            alignment: {horizontal: 'right', vertical: 'center'},
            border: {
                left: {style: 'thin', color: '#000000'},
                right: {style: 'thin', color: '#000000'},
                top: {style: 'thin', color: '#000000'},
                bottom: {style: 'thin', color: '#000000'}
            }
        });

        let rowIndex = 6;

        const filteredData = data.filter(sale => {
            return (!filter.producer || sale.shipOwnerId === filter.producer) &&
                (!filter.solde || sale.total === filter.solde);
        });
        filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        const groupedByDate = _.groupBy(filteredData, item => item.date);

        let totalProducerCommissionSum = 0;
        let totalSum = 0;
        let totalToPaySum = 0;
        let numberFormat = {numberFormat: '#,##0.00; (#,##0.00); -'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let currencyFormatStyle = {numberFormat: '_-* # ##0.00\\ [$TND]_-;-* # ##0.00\\ [$TND]_-;_-* "-"??\\ [$TND]_-;_-@_-'};
        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            const groupedByProducer = _.groupBy(dateGroup, item => item.producerName);
            let isFirstDateRow = true;
            Object.keys(groupedByProducer).forEach(producer => {
                const producerGroup = groupedByProducer[producer];
                let isFirstProducerRow = true;

                producerGroup.forEach((sale, index) => {

                    totalProducerCommissionSum += sale.totalProducerCommission || 0;
                    totalToPaySum += sale.totalToPay || 0;
                    totalSum += sale.total || 0;
                    if (isFirstDateRow) {
                        ws.cell(rowIndex, 1, rowIndex + dateGroup.length - 1, 1, true)
                            .date(sale.date)
                            .style(rowStyle).style(dateFormatStyle);
                        isFirstDateRow = false;
                    }
                    if (!filter.producer) {
                        if (isFirstProducerRow) {
                            ws.cell(rowIndex, 2, rowIndex + producerGroup.length - 1, 2, true).string(sale.producerName?.toUpperCase() || "Non spécifié").style(rowStyle);
                            isFirstProducerRow = false;
                        }
                    }

                    let colIndex = 2;
                    if (!filter.producer)
                        colIndex++;

                    ws.cell(rowIndex, colIndex).number(sale.receiptNumber).style(rowStyleRight);
                    colIndex++;
                    ws.cell(rowIndex, colIndex).number(sale.total).style(rowStyleRight).style(numberFormat);
                    colIndex++;
                    ws.cell(rowIndex, colIndex).number(sale.totalProducerCommission).style(rowStyleRight).style(numberFormat);
                    colIndex++;
                    ws.cell(rowIndex, colIndex).number(sale.totalToPay).style(rowStyleRight).style(numberFormat);
                    rowIndex++;
                });
            });
        });

        let colIndex = 3;
        if (filter.producer)
            colIndex--;
        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        const totalPriceStyle = wb.createStyle({
            font: {size: 9, bold: true},
            alignment: {horizontal: 'right', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, 1, rowIndex, colIndex, true).string('Total').style(totalStyle);
        colIndex++;
        const totalData = [totalProducerCommissionSum.toLocaleString('fr-TN', {
            style: 'currency',
            currency: 'TND',
            minimumFractionDigits: 2
        }), totalToPaySum.toLocaleString('fr-TN', {
            style: 'currency',
            currency: 'TND',
            minimumFractionDigits: 2
        }), '', totalSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2})
        ];
        ws.cell(rowIndex, colIndex).number(totalSum).style(totalPriceStyle).style(numberFormat);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalProducerCommissionSum).style(totalPriceStyle).style(numberFormat);
        colIndex++;
        ws.cell(rowIndex, colIndex).number(totalToPaySum).style(totalPriceStyle).style(numberFormat);
        const fileName = "Production.xlsx";
        const excelFile = tools.Excel_PATH;
        if (!fs.existsSync(excelFile)) {
            fs.mkdirSync(excelFile, {recursive: true});
        }
        const filePath = path.join(excelFile, fileName);

        wb.write(filePath, function (err, stats) {
            if (err) {
                console.error("Error generating Excel file:", err);
                return res.status(500).send('Error generating Excel file');
            }
            res.status(201).json(new Response(fileName));
            res.download(filePath);
        });
    } catch (err) {
        console.error("Erreur lors de la génération du fichier Excel:", err);
        res.status(500).json({success: false, message: err.message});
    }

};


module.exports = router;
