var router = require('express').Router();
const dao = require("../dao/saleDao");
const shipOwnerDao = require("../dao/shipOwnerDao");
const balanceController = require("../controllers/balanceController");
const salePaymentDao = require("../dao/salePaymentDao");
const boatDao = require("../dao/boatDao");
const salesTransactionDao = require("../dao/salesTransactionDao");
const Response = require("../utils/response");
const {Merchant, CommissionValue, Commission, SalesTransaction, PaymentInfo} = require("../models");
const boxesTransactionController = require("./boxesTransactionController");
const fs = require("fs");
const path = require("path");

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
    let fileName = "pdfFile.pdf";
    res.status(201).json(new Response(fileName));
});
module.exports = router;
