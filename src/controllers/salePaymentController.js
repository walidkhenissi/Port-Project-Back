const router = require('express').Router();
const dao = require("../dao/salePaymentDao");
const saleDao = require("../dao/saleDao");
const Response = require("../utils/response");
const paymentDao = require("../dao/paymentDao");
const paymentController = require("./paymentController");
const saleController = require("./saleController");
const balanceController = require("./balanceController");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving salePayment :', error);
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
        console.error('Error retrieving salePayment :', error);
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
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const salePayment = req.body;
    try {
        // console.log("=====================>salePayment : " + JSON.stringify(salePayment));
        if (tools.isFalsey(salePayment.paymentId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        if (tools.isFalsey(salePayment.saleId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = await paymentDao.get(salePayment.paymentId);
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let sale = await saleDao.get(salePayment.saleId);
        if (!sale)
            return res.status(404).json(new Response({error: 'Sale not found error'}, true));
        salePayment.paymentTypeId = payment.paymentTypeId;
        try {
            payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [salePayment], [], []);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        payment = await paymentController.checkConsumptionInfo(payment);
        const salePayments = await dao.list({where: {saleId: sale.id}});
        const affectedPaymentsValue = _.sumBy(salePayments, 'value');
        if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        else {
            sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
            sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
            sale = await saleController.checkPaymentInfo(sale);
        }
        salePayment.value = Number(parseFloat(salePayment.value).toFixed(3));
        const created = await dao.create(salePayment);
        sale = await saleDao.update(sale);
        await paymentDao.update(payment);
        if (sale.shipOwnerId)
            await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});


router.put('/update', async (req, res) => {
    const salePayment = req.body;
    try {
        if (tools.isFalsey(salePayment.paymentId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        if (tools.isFalsey(salePayment.saleId))
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = await paymentDao.get(salePayment.paymentId);
        let oldPayment;
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let sale = await saleDao.get(salePayment.saleId);
        if (!sale)
            return res.status(404).json(new Response({error: 'Sale not found error'}, true));
        salePayment.paymentTypeId = payment.paymentTypeId;
        const oldSalePayment = await dao.get(salePayment.id);
        if (oldSalePayment.paymentId == salePayment.paymentId && oldSalePayment.saleId == salePayment.saleId) {
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [salePayment], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            const salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            const affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
            // console.log("=====================>payment : " + JSON.stringify(payment));
        } else if (oldSalePayment.paymentId == salePayment.paymentId && oldSalePayment.saleId != salePayment.saleId) {
            //Check the payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [salePayment], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the new sale
            let salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            let affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
            //Check the old sale
            sale = oldSalePayment.sale;
            salePayments = await dao.list({
                where: {
                    saleId: oldSalePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if (affectedPaymentsValue > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = affectedPaymentsValue;
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        } else if (oldSalePayment.paymentId != salePayment.paymentId && oldSalePayment.saleId == salePayment.saleId) {
            //Check the new payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [salePayment], [], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the old payment
            payment = oldSalePayment.payment;
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [], [salePayment]);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check sale
            const salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            const affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        } else if (oldSalePayment.paymentId != salePayment.paymentId && oldSalePayment.saleId != salePayment.saleId) {
            //Check the new payment
            try {
                payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [salePayment], [], []);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // payment = await paymentController.checkConsumptionInfo(payment);
            // await paymentDao.update(payment);
            //Check the old payment
            payment = oldSalePayment.payment;
            try {
                oldPayment = await paymentController.checkAndCalculatePaymentCapacityForSale(oldPayment, [], [], [salePayment]);
            } catch (err) {
                return res.status(404).json(new Response({errorCode: err.message}, true));
            }
            // oldPayment = await paymentController.checkConsumptionInfo(oldPayment);
            // await paymentDao.update(oldPayment);
            //Check the new sale
            let salePayments = await dao.list({
                where: {
                    saleId: salePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            let affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if ((affectedPaymentsValue + salePayment.value) > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = Number(parseFloat(affectedPaymentsValue + salePayment.value).toFixed(3));
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
            //Check the old sale
            sale = oldSalePayment.sale;
            salePayments = await dao.list({
                where: {
                    saleId: oldSalePayment.saleId,
                    id: {'!': salePayment.id}
                }
            });
            affectedPaymentsValue = _.sumBy(salePayments, 'value');
            if (affectedPaymentsValue > sale.totalToPay)
                return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
            else {
                sale.totalPaid = affectedPaymentsValue;
                sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
                sale = await saleController.checkPaymentInfo(sale);
            }
            sale = await saleDao.update(sale);
            if (sale.shipOwnerId)
                await balanceController.updateByShipOwnerAsProducer(sale.shipOwnerId, sale.date);
        }
        const updated = await dao.update(salePayment);
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
        console.error('Error updating salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        let salePayment = await dao.get(id);
        // console.log("=====================>id : " + JSON.stringify(id));
        // console.log("=====================>salePayment : " + JSON.stringify(salePayment));
        if (!salePayment)
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        let payment = salePayment.payment;
        if (!payment)
            return res.status(404).json(new Response({error: 'Payment not found error'}, true));
        let sale = salePayment.sale;
        if (!sale)
            return res.status(404).json(new Response({error: 'Sale not found error'}, true));
        try {
            payment = await paymentController.checkAndCalculatePaymentCapacityForSale(payment, [], [], [salePayment]);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        payment = await paymentController.checkConsumptionInfo(payment);
        const salePayments = await dao.list({
            where: {
                saleId: sale.id,
                id: {'!': salePayment.id}
            }
        });
        const affectedPaymentsValue = _.sumBy(salePayments, 'value');
        if (affectedPaymentsValue > sale.totalToPay)
            return res.status(404).json(new Response({errorCode: '#EXCEED_PAYMENT_VALUE'}, true));
        else {
            sale.totalPaid = affectedPaymentsValue;
            sale.restToPay = Number(parseFloat(sale.totalToPay - sale.totalPaid).toFixed(3));
            sale = await saleController.checkPaymentInfo(sale);
        }
        await dao.remove(id);
        await saleDao.update(sale);
        await paymentDao.update(payment);
        res.status(201).json(new Response());
    } catch (error) {
        console.error('Error removing salePayment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

module.exports = router;
