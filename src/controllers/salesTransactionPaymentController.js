const router = require('express').Router();
const dao = require("../dao/salesTransactionPaymentDao");
const salesTransactionDao = require("../dao/salesTransactionDao");
const paymentDao = require("../dao/paymentDao");
const paymentController = require("../controllers/paymentController");
const salesTransactionController = require("../controllers/salesTransactionController");
const Response = require("../utils/response");
const salesTransactionPaymentDao = require("../dao/salesTransactionPaymentDao");
moment.locale('fr');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving salesTransactionPayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving salesTransactionPayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/findWithDetails', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.findWithDetails(criteria);
        const count = await dao.count({where: whereCriteria});
        // console.log("=====================>data : " + JSON.stringify(data));
        let dataList = [];
        for (const key in data) {
            const salesTransactionPayment = JSON.parse(JSON.stringify(data[key]));
            const salesTransaction = await salesTransactionDao.get(salesTransactionPayment.salesTransactionId);
            // const sale = await saleDao.get(salesTransaction.saleId);
            salesTransactionPayment.salesTransaction = salesTransaction;
            // salesTransactionPayment.salesTransaction.sale = sale;
            dataList.push(salesTransactionPayment);
        }
        const response = new Response();
        response.data = dataList;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving salesTransactionPayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving salesTransactionPayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const salesTransactionPayment = req.body;
    try {
        // console.log("=====================>salesTransactionPayment : " + JSON.stringify(salesTransactionPayment));
        if (tools.isFalsey(salesTransactionPayment.paymentId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        if (tools.isFalsey(salesTransactionPayment.salesTransactionId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = await paymentDao.get(salesTransactionPayment.paymentId);
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let salesTransaction = await salesTransactionDao.get(salesTransactionPayment.salesTransactionId);
        if (!salesTransaction)
            return res.status(404).json(new Response({error: 'SalesTransaction not found error'}, true));
        salesTransactionPayment.paymentTypeId = payment.paymentTypeId;
        try {
            payment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(payment, [salesTransactionPayment], [], []);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        // payment = await paymentController.checkConsumptionInfo(payment);
        const salesTransactionPayments = await salesTransactionPaymentDao.list({where: {salesTransactionId: salesTransaction.id}});
        const affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
        if ((affectedPaymentsValue + salesTransactionPayment.value) > salesTransaction.totalToPayByMerchant)
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        else {
            salesTransaction.totalMerchantPayment = affectedPaymentsValue + salesTransactionPayment.value;
            salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
            salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
        }
        const created = await dao.create(salesTransactionPayment);
        await salesTransactionDao.update(salesTransaction);
        payment = await paymentController.checkConsumptionInfo(payment);
        await paymentDao.update(payment);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating salesTransactionPayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const salesTransactionPayment = req.body;
    try {
        if (tools.isFalsey(salesTransactionPayment.paymentId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        if (tools.isFalsey(salesTransactionPayment.salesTransactionId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = await paymentDao.get(salesTransactionPayment.paymentId);
        let oldPayment;
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let salesTransaction = await salesTransactionDao.get(salesTransactionPayment.salesTransactionId);
        if (!salesTransaction)
            return res.status(404).json(new Response({error: 'SalesTransaction not found error'}, true));
        salesTransactionPayment.paymentTypeId = payment.paymentTypeId;
        const oldSalesTransactionPayment = await dao.get(salesTransactionPayment.id);
        if (oldSalesTransactionPayment.paymentId == salesTransactionPayment.paymentId && oldSalesTransactionPayment.salesTransactionId == salesTransactionPayment.salesTransactionId) {
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(payment, [], [salesTransactionPayment], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            const salesTransactionPayments = await salesTransactionPaymentDao.list({
                where: {
                    salesTransactionId: salesTransactionPayment.salesTransactionId,
                    id: {'!': salesTransactionPayment.id}
                }
            });
            const affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
            if ((affectedPaymentsValue + salesTransactionPayment.value) > salesTransaction.totalToPayByMerchant)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                salesTransaction.totalMerchantPayment = affectedPaymentsValue + salesTransactionPayment.value;
                salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
                salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
            }
            await salesTransactionDao.update(salesTransaction);
            // await paymentDao.update(payment);
        } else if (oldSalesTransactionPayment.paymentId == salesTransactionPayment.paymentId && oldSalesTransactionPayment.salesTransactionId != salesTransactionPayment.salesTransactionId) {
            //Check the payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(payment, [], [salesTransactionPayment], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the new salesTransaction
            let salesTransactionPayments = await salesTransactionPaymentDao.list({
                where: {
                    salesTransactionId: salesTransactionPayment.salesTransactionId,
                    id: {'!': salesTransactionPayment.id}
                }
            });
            let affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
            if ((affectedPaymentsValue + salesTransactionPayment.value) > salesTransaction.totalToPayByMerchant)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                salesTransaction.totalMerchantPayment = affectedPaymentsValue + salesTransactionPayment.value;
                salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
                salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
            }
            await salesTransactionDao.update(salesTransaction);
            //Check the old salesTransaction
            salesTransaction = oldSalesTransactionPayment.salesTransaction;
            salesTransactionPayments = await salesTransactionPaymentDao.list({
                where: {
                    salesTransactionId: oldSalesTransactionPayment.salesTransactionId,
                    id: {'!': salesTransactionPayment.id}
                }
            });
            affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
            if (affectedPaymentsValue > salesTransaction.totalToPayByMerchant)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                salesTransaction.totalMerchantPayment = affectedPaymentsValue;
                salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
                salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
            }
            await salesTransactionDao.update(salesTransaction);
        } else if (oldSalesTransactionPayment.paymentId != salesTransactionPayment.paymentId && oldSalesTransactionPayment.salesTransactionId == salesTransactionPayment.salesTransactionId) {
            //Check the new payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(payment, [salesTransactionPayment], [], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            payment = await paymentController.checkConsumptionInfo(payment);
            await paymentDao.update(payment);
            //Check the old payment
            oldPayment = oldSalesTransactionPayment.payment;
            try {
                oldPayment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(oldPayment, [], [], [salesTransactionPayment]);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // oldPayment = await paymentController.checkConsumptionInfo(oldPayment);
            // await paymentDao.update(oldPayment);
            //Check salesTransaction
            const salesTransactionPayments = await salesTransactionPaymentDao.list({
                where: {
                    salesTransactionId: salesTransactionPayment.salesTransactionId,
                    id: {'!': salesTransactionPayment.id}
                }
            });
            const affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
            if ((affectedPaymentsValue + salesTransactionPayment.value) > salesTransaction.totalToPayByMerchant)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                salesTransaction.totalMerchantPayment = affectedPaymentsValue + salesTransactionPayment.value;
                salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
                salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
            }
            await salesTransactionDao.update(salesTransaction);
        } else if (oldSalesTransactionPayment.paymentId != salesTransactionPayment.paymentId && oldSalesTransactionPayment.salesTransactionId != salesTransactionPayment.salesTransactionId) {
            //Check the new payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(payment, [salesTransactionPayment], [], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the old payment
            oldPayment = oldSalesTransactionPayment.payment;
            try {
                oldPayment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(oldPayment, [], [], [salesTransactionPayment]);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // oldPayment = await paymentController.checkConsumptionInfo(oldPayment);
            // await paymentDao.update(oldPayment);
            //Check the new salesTransaction
            let salesTransactionPayments = await salesTransactionPaymentDao.list({
                where: {
                    salesTransactionId: salesTransactionPayment.salesTransactionId,
                    id: {'!': salesTransactionPayment.id}
                }
            });
            let affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
            if ((affectedPaymentsValue + salesTransactionPayment.value) > salesTransaction.totalToPayByMerchant)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                salesTransaction.totalMerchantPayment = affectedPaymentsValue + salesTransactionPayment.value;
                salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
                salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
            }
            await salesTransactionDao.update(salesTransaction);
            //Check the old salesTransaction
            salesTransaction = oldSalesTransactionPayment.salesTransaction;
            salesTransactionPayments = await salesTransactionPaymentDao.list({
                where: {
                    salesTransactionId: oldSalesTransactionPayment.salesTransactionId,
                    id: {'!': salesTransactionPayment.id}
                }
            });
            affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
            if (affectedPaymentsValue > salesTransaction.totalToPayByMerchant)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                salesTransaction.totalMerchantPayment = affectedPaymentsValue;
                salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
                salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
            }
            await salesTransactionDao.update(salesTransaction);
        }
        const updated = await dao.update(salesTransactionPayment);
        if (payment) {
            payment = await paymentController.checkConsumptionInfo(payment);
            await paymentDao.update(payment);
        }
        if (oldPayment) {
            oldPayment = await paymentController.checkConsumptionInfo(oldPayment);
            await paymentDao.update(oldPayment);
        }
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating salesTransactionPayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        let salesTransactionPayment = await dao.get(id);
        // console.log("=====================>id : " + JSON.stringify(id));
        // console.log("=====================>salesTransactionPayment : " + JSON.stringify(salesTransactionPayment));
        if (!salesTransactionPayment)
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = salesTransactionPayment.payment;
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let salesTransaction = salesTransactionPayment.salesTransaction;
        if (!salesTransaction)
            return res.status(404).json(new Response({error: 'SalesTransaction not found error'}, true));
        try {
            payment = await paymentController.checkAndCalculatePaymentCapacityForSalesTransactions(payment, [], [], [salesTransactionPayment]);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        // payment = await paymentController.checkConsumptionInfo(payment);
        const salesTransactionPayments = await salesTransactionPaymentDao.list({
            where: {
                salesTransactionId: salesTransaction.id,
                id: {'!': salesTransactionPayment.id}
            }
        });
        const affectedPaymentsValue = _.sumBy(salesTransactionPayments, 'value');
        if (affectedPaymentsValue > salesTransaction.totalToPayByMerchant)
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        else {
            salesTransaction.totalMerchantPayment = affectedPaymentsValue;
            salesTransaction.restMerchantPayment = salesTransaction.totalToPayByMerchant - salesTransaction.totalMerchantPayment;
            salesTransaction = await salesTransactionController.checkPaymentInfo(salesTransaction);
        }
        await dao.remove(id);
        await salesTransactionDao.update(salesTransaction);
        payment = await paymentController.checkConsumptionInfo(payment);
        await paymentDao.update(payment);
        res.status(201).json(new Response());
    } catch (error) {
        console.error('Error removing salesTransactionPayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

module.exports = router;
