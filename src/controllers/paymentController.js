const router = require('express').Router();
const dao = require("../dao/paymentDao");
const cashTransactionDao = require("../dao/cashTransactionDao");
const salesTransactionPaymentDao = require("../dao/salesTransactionPaymentDao");
const salePaymentDao = require("../dao/salePaymentDao");
const balanceController = require("../controllers/balanceController");
const cashTransactionController = require("../controllers/cashTransactionController");
const Response = require("../utils/response");
const {ConsumptionInfo, PaymentType, Merchant, CashAccount, Bank, Payment} = require("../models");
const _ = require("lodash");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving payment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    let criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        const sum = await dao.sum({where: {id:_.map(data, 'id')}});
        // console.log("=====================>sum : " + JSON.stringify(sum));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        response.metaData.sum = sum;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving payment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving payment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    let payment = req.body;
    try {
        payment = await router.checkDataConstraints(payment);
        try {
            payment = await router.checkAndCalculatePaymentCapacityForSalesTransactions(payment);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        payment = await router.checkConsumptionInfo(payment);
        // console.log("=====================>payment : " + JSON.stringify(payment));
        const created = await dao.create(payment);
        const paymentType = await PaymentType.findByPk(created.paymentTypeId);
        if (paymentType.reference === 'CASH') {
            //Manage cash box
            const cashTransactionAccount = await CashAccount.findOne({where: {key: created.isCommissionnaryPayment ? producerPaymentAccountKey : productSalesAccountKey}});
            if (!cashTransactionAccount)
                res.status(404).json(new Response({error: 'Internal Server Error'}, true));
            let cashTransactionName = "";
            if (created.merchantId && !created.isCommissionnaryPayment) {
                const paymentOwner = await Merchant.findByPk(created.merchantId);
                if (!paymentOwner)
                    res.status(404).json(new Response({error: 'Internal Server Error'}, true));
                else
                    cashTransactionName = paymentOwner.name.concat('-').concat(paymentType.name).concat('-').concat(moment(created.date).format('YYYY-MM-DD')).concat('_').concat(created.value).concat('Dt');
            } else if (created.isCommissionnaryPayment)
                cashTransactionName = 'Ste Poissons Amich'.concat('-').concat(paymentType.name).concat('-').concat(moment(created.date).format('YYYY-MM-DD')).concat('_').concat(created.value).concat('Dt');
            const createdCashTransaction = await cashTransactionDao.create({
                date: created.date,
                name: cashTransactionName,
                credit: created.isCommissionnaryPayment ? 0 : created.value,
                debit: created.isCommissionnaryPayment ? created.value : 0,
                balance: 0,//Will be updated
                accountId: cashTransactionAccount.id,
                paymentId: created.id,
                isCommissionnary: created.isCommissionnaryPayment
            });
            //Update cash box balance
            await cashTransactionController.updateBalance(createdCashTransaction.date);
        }
        //Manage payment Owner Balance : Merchant balance
        if (created.merchantId && !created.isCommissionnaryPayment)
            await balanceController.updateMerchantBalance(created.merchantId, created.date);
        res.status(201).json(new Response(created));
    } catch
        (error) {
        console.error('Error creating payment :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
})
;

router.put('/update', async (req, res) => {
    let payment = req.body;
    try {
        if (!payment.id)
            return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
        const oldPayment = await dao.get(payment.id);
        if (!oldPayment)
            return res.status(404).json(new Response({error: 'Payment not found Error'}, true));
        payment = await router.checkDataConstraints(payment);
        try {
            payment = await router.checkAndCalculatePaymentCapacityForSalesTransactions(payment);
        } catch (err) {
            return res.status(404).json(new Response({errorCode: err.message}, true));
        }
        payment = await router.checkConsumptionInfo(payment);
        const updated = await dao.update(payment);
        if (updated.merchantId && !updated.isCommissionnaryPayment) {
            await balanceController.updateMerchantBalance(updated.merchantId, updated.date);
            if (updated.merchantId != oldPayment.merchantId)
                await balanceController.updateMerchantBalance(oldPayment.merchantId, oldPayment.date);
        }
        const paymentType = await PaymentType.findByPk(updated.paymentTypeId);
        let oldPaymentType;
        if (paymentType.reference === 'CASH') {
            //Manage cash box
            const cashTransaction = await cashTransactionDao.findOne({where: {paymentId: updated.id}});
            let cashTransactionName = "";
            if (updated.merchantId && !updated.isCommissionnaryPayment) {
                const paymentOwner = await Merchant.findByPk(updated.merchantId);
                if (!paymentOwner)
                    return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
                else
                    cashTransactionName = paymentOwner.name.concat('-').concat(paymentType.name).concat('-').concat(moment(updated.date).format('YYYY-MM-DD')).concat('_').concat(updated.value).concat('Dt');
            } else if (updated.isCommissionnaryPayment)
                cashTransactionName = 'Ste Poissons Amich'.concat('-').concat(paymentType.name).concat('-').concat(moment(updated.date).format('YYYY-MM-DD')).concat('_').concat(updated.value).concat('Dt');
            if (!cashTransaction) {
                const cashTransactionAccount = await CashAccount.findOne({where: {key: updated.isCommissionnaryPayment ? producerPaymentAccountKey : productSalesAccountKey}});
                if (!cashTransactionAccount)
                    return res.status(404).json(new Response({error: 'Internal Server Error'}, true));
                const createdCashTransaction = await cashTransactionDao.create({
                    date: updated.date,
                    name: cashTransactionName,
                    credit: updated.isCommissionnaryPayment ? 0 : updated.value,
                    debit: updated.isCommissionnaryPayment ? updated.value : 0,
                    balance: 0,//Will be updated
                    accountId: cashTransactionAccount.id,
                    paymentId: updated.id,
                    isCommissionnary: updated.isCommissionnaryPayment
                });
            } else {
                cashTransaction.name = cashTransactionName;
                if (!moment(cashTransaction.date).isSame(moment(updated.date), 'day'))
                    cashTransaction.date = tools.refactorDate(updated.date);
                cashTransaction.credit = updated.isCommissionnaryPayment ? 0 : updated.value;
                cashTransaction.debit = updated.isCommissionnaryPayment ? updated.value : 0;
                cashTransaction.isCommissionnary = updated.isCommissionnaryPayment;
                await cashTransactionDao.update(cashTransaction);
            }
        } else {
            oldPaymentType = await PaymentType.findByPk(oldPayment.paymentTypeId);
            if (oldPaymentType.reference === 'CASH') {
                const transaction = await cashTransactionDao.findOne({where: {paymentId: oldPayment.id}});
                if (transaction)
                    await cashTransactionDao.remove(transaction.id);
            }
        }
        if (paymentType.reference === 'CASH' || (oldPaymentType && oldPaymentType.reference === 'CASH')) {
            const minDate = moment(updated.date).isAfter(moment(oldPayment.date), 'day') ? oldPayment.date : updated.date;
            // console.log("=====================>update balace starting from : " + JSON.stringify(moment(minDate).format('YYYY-MM-DD')));
            await cashTransactionController.updateBalance(minDate);
        }
        return res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating payment :', error);
        return res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        let payment = await dao.get(id);
        if (!payment)
            return res.status(404).json(new Response({errorCode: '#NOT_FOUND_ERROR'}, true));
        if (payment.isCommissionnaryPayment) {
            const salePayments = await salePaymentDao.find({where: {paymentId: payment.id}});
            // console.log("=====================>salePayments : " + JSON.stringify(salePayments));
            if (salePayments && salePayments.length)
                return res.status(404).json(new Response({errorCode: '#USED_DATA_ERROR'}, true));
            else
                await dao.remove(id);
        } else {
            const salesTransactionPayments = await salesTransactionPaymentDao.find({where: {paymentId: payment.id}});
            if (salesTransactionPayments && salesTransactionPayments.length)
                return res.status(404).json(new Response({errorCode: '#USED_DATA_ERROR'}, true));
            else
                await dao.remove(id);
        }
        // removed payment case, so, check the cash payment type
        let removed;
        if (payment.paymentType.reference === 'CASH') {
            let cashTransaction = await cashTransactionDao.findOne({where: {paymentId: payment.id}});
            if (cashTransaction)
                removed = await cashTransactionController.remove(cashTransaction);
        }
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing bank :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.checkDataConstraints = async function (payment) {
    let paymentType, paymentOwner;
    if (!payment.merchantId && !payment.isCommissionnaryPayment) {
        throw new Error('No payment Owner Error');
        return;
    }
    if (tools.isFalsey(payment.value) || payment.value < 0) {
        throw new Error('Payment value Error');
        return;
    }
    if (tools.isFalsey(payment.date))
        payment.date = new Date();
    if (tools.isFalsey(payment.paymentTypeId)) {
        throw new Error('No payment type definition Error');
        return;
    } else {
        paymentType = await PaymentType.findByPk(payment.paymentTypeId);
        if (!paymentType) {
            throw new Error('Payment Type definition Error');
            return;
        }
        if (paymentType.reference == 'CHEQUE' || paymentType.reference == 'PROMISSORY') {
            if (tools.isFalsey(payment.number)) {
                throw new Error('Mandatory payment number Error');
                return;
            }
            if (tools.isFalsey(payment.dueDate)) {
                throw new Error('Mandatory payment due date Error');
                return;
            }
            if (tools.isFalsey(payment.bankId)) {
                throw new Error('Mandatory payment bank Error');
                return;
            } else {
                const bank = await Bank.findByPk(payment.bankId);
                if (!bank) {
                    throw new Error('Payment bank not found Error');
                    return;
                }
            }
        } else {
            delete payment.number;
            delete payment.bankId;
            delete payment.dueDate;
            delete payment.signatory;
        }
    }
    if (payment.merchantId) {
        paymentOwner = await Merchant.findByPk(payment.merchantId);
        if (!paymentOwner) {
            throw new Error('Payment Owner Error! Not found merchant!');
            return;
        } else
            payment.name = paymentOwner.name.concat('-').concat(paymentType.name).concat('-').concat(moment(payment.date).format('YYYY-MM-DD')).concat('_').concat(payment.value).concat('Dt');
        payment.isCommissionnaryPayment = false;
    } else if (payment.isCommissionnaryPayment)
        payment.name = 'Ste Poissons Amich'.concat('-').concat(paymentType.name).concat('-').concat(moment(payment.date).format('YYYY-MM-DD')).concat('_').concat(payment.value).concat('Dt');
    return payment;
}

//payment should be with new values in update payment case
//salesTransactionPaymentsToCreate : salesTransactionPayments list to create
//salesTransactionPaymentsToUpdate : salesTransactionPayments list to update
//salesTransactionPaymentsToRemove : salesTransactionPayments list to remove
router.checkAndCalculatePaymentCapacityForSalesTransactions = async function (payment, salesTransactionPaymentsToCreate = [], salesTransactionPaymentsToUpdate = [], salesTransactionPaymentsToRemove = []) {
    payment.value = payment.value || 0;
    if (!payment.id) {
        //Creation payment case
        let toPay = _.sumBy(salesTransactionPaymentsToCreate, 'value');
        if (toPay > payment.value) {
            throw new Error('#EXCEED_PAYMENT_VALUE');
            return;
        }
        payment.consumed = toPay;
        payment.rest = Number(parseFloat(payment.value - toPay).toFixed(3));
    } else {
        //Update payment case
        let existingSalesTransactionPayments = await salesTransactionPaymentDao.list({where: {paymentId: payment.id}});
        const existingIds = _.keys(_.keyBy(existingSalesTransactionPayments, 'id')).map(Number);
        const toUpdateIds = _.keys(_.keyBy(salesTransactionPaymentsToUpdate, 'id')).map(Number);
        const toRemoveIds = _.keys(_.keyBy(salesTransactionPaymentsToRemove, 'id')).map(Number);
        for (const key in toUpdateIds) {
            if (!existingIds.includes(toUpdateIds[key])) {
                throw new Error('#INTERNAL_ERROR');
                return;
            }
        }
        for (const key in toRemoveIds) {
            if (!existingIds.includes(toRemoveIds[key])) {
                throw new Error('#INTERNAL_ERROR');
                return;
            }
        }
        let toPay = _.sumBy(_.filter(existingSalesTransactionPayments, function (salesTransactionPayment) {
            return !toUpdateIds.includes(salesTransactionPayment.id) && !toRemoveIds.includes(salesTransactionPayment.id);
        }), 'value');
        toPay += _.sumBy(salesTransactionPaymentsToUpdate, 'value');
        toPay += _.sumBy(salesTransactionPaymentsToCreate, 'value');
        if (toPay > payment.value) {
            throw new Error('#EXCEED_PAYMENT_VALUE');
            return;
        }
        payment.consumed = toPay;
        payment.rest = Number(parseFloat(payment.value - toPay).toFixed(3));
        // for (const key in salesTransactionPaymentsToCreate) {
        //     let toCreate = salesTransactionPaymentsToCreate[key];
        //     toCreate.paymentId = payment.id;
        //     await salesTransactionPaymentDao.create(toCreate);
        // }
        // for (const key in salesTransactionPaymentsToUpdate) {
        //     let toUpdate = salesTransactionPaymentsToUpdate[key];
        //     toUpdate.paymentId = payment.id;
        //     await salesTransactionPaymentDao.update(toUpdate);
        // }
        // for (const key in salesTransactionPaymentsToRemove) {
        //     let toRemove = salesTransactionPaymentsToUpdate[key];
        //     if (toRemove.paymentId == payment.id)
        //         await salesTransactionPaymentDao.remove(toRemove);
        // }
    }
    return payment;
}

router.checkConsumptionInfo = async function (payment) {
    // console.log("=====================>payment : " + JSON.stringify(payment));
    payment.value = payment.value || 0;
    if (payment.id) {
        let persistedPayment = await dao.get(payment.id);
        if (persistedPayment.isCommissionnaryPayment) {
            const salePayments = await salePaymentDao.find({where: {paymentId: payment.id}});
            payment.consumed = Number(parseFloat(_.sumBy(salePayments, 'value')).toFixed(3));
        } else {
            const salesTransactionPayments = await salesTransactionPaymentDao.find({where: {paymentId: payment.id}});
            payment.consumed = Number(parseFloat(_.sumBy(salesTransactionPayments, 'value')).toFixed(3));
        }
    } else {
        if (tools.isFalsey(payment.consumed))
            payment.consumed = 0;
    }
    payment.rest = Number(parseFloat(payment.value - payment.consumed).toFixed(3));
    let criteriaRef;
    if (payment.consumed == 0) {
        criteriaRef = {reference: 'NOT_CONSUMED'};
    } else if (payment.rest == 0) {
        criteriaRef = {reference: 'CONSUMED'};
    } else {
        criteriaRef = {reference: 'PARTIALLY_CONSUMED'};
    }
    // console.log("=====================>payment : " + JSON.stringify(payment));
    const consumptionInfo = await ConsumptionInfo.findOne({where: criteriaRef});
    if (!consumptionInfo) {
        throw new Error('No consumption Info definition Error');
        return;
    }
    payment.consumptionInfoId = consumptionInfo.id;
    return payment;
}

//payment should be with new values in update payment case
//salePaymentsToCreate : salePayments list to create
//salePaymentsToUpdate : salePayments list to update
//salePaymentsToRemove : salePayments list to remove
router.checkAndCalculatePaymentCapacityForSale = async function (payment, salePaymentsToCreate = [], salePaymentsToUpdate = [], salePaymentsToRemove = []) {
    payment.value = payment.value || 0;
    if (!payment.id) {
        //Creation payment case
        let toPay = _.sumBy(salePaymentsToCreate, 'value');
        if (toPay > payment.value) {
            throw new Error('#EXCEED_PAYMENT_VALUE');
            return;
        }
        payment.consumed = toPay;
        payment.rest = payment.value - toPay;
    } else {
        //Update payment case
        let existingSalePayments = await salePaymentDao.list({where: {paymentId: payment.id}});
        const existingIds = _.keys(_.keyBy(existingSalePayments, 'id')).map(Number);
        const toUpdateIds = _.keys(_.keyBy(salePaymentsToUpdate, 'id')).map(Number);
        const toRemoveIds = _.keys(_.keyBy(salePaymentsToRemove, 'id')).map(Number);
        for (const key in toUpdateIds) {
            if (!existingIds.includes(toUpdateIds[key])) {
                throw new Error('#INTERNAL_ERROR');
                return;
            }
        }
        for (const key in toRemoveIds) {
            if (!existingIds.includes(toRemoveIds[key])) {
                throw new Error('#INTERNAL_ERROR');
                return;
            }
        }
        let toPay = _.sumBy(_.filter(existingSalePayments, function (salePayment) {
            return !toUpdateIds.includes(salePayment.id) && !toRemoveIds.includes(salePayment.id);
        }), 'value');
        toPay += _.sumBy(salePaymentsToUpdate, 'value');
        toPay += _.sumBy(salePaymentsToCreate, 'value');
        if (toPay > payment.value) {
            throw new Error('#EXCEED_PAYMENT_VALUE');
            return;
        }
        payment.consumed = toPay;
        payment.rest = payment.value - toPay;
        // for (const key in salePaymentsToCreate) {
        //     let toCreate = salePaymentsToCreate[key];
        //     toCreate.paymentId = payment.id;
        //     await salesTransactionPaymentDao.create(toCreate);
        // }
        // for (const key in salePaymentsToUpdate) {
        //     let toUpdate = salePaymentsToUpdate[key];
        //     toUpdate.paymentId = payment.id;
        //     await salesTransactionPaymentDao.update(toUpdate);
        // }
        // for (const key in salePaymentsToRemove) {
        //     let toRemove = salePaymentsToUpdate[key];
        //     if (toRemove.paymentId == payment.id)
        //         await salesTransactionPaymentDao.remove(toRemove);
        // }
    }
    return payment;
}

module.exports = router;
