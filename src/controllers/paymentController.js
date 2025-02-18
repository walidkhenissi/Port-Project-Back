const router = require('express').Router();
const dao = require("../dao/paymentDao");
const cashTransactionDao = require("../dao/cashTransactionDao");
const salesTransactionPaymentDao = require("../dao/salesTransactionPaymentDao");
const salePaymentDao = require("../dao/salePaymentDao");
const balanceController = require("../controllers/balanceController");
const cashTransactionController = require("../controllers/cashTransactionController");
const Response = require("../utils/response");
const {ConsumptionInfo, PaymentType, Merchant, CashAccount, Bank, Payment,} = require("../models");
const _ = require("lodash");
const {Op} = require("sequelize");
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const xl = require("excel4node");
moment.locale('fr');

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
        payment.date=tools.refactorDate(payment.date);
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
                date: tools.refactorDate(created.date),
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
        payment.date=tools.refactorDate(payment.date);
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
                    date: tools.refactorDate(updated.date),
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


router.post('/generatePaymentReport', async (req, res) => {
    try {
        const dataToReport = await router.getPaymentReportData(req.body);
       const username = req.session.username;
        if (req.body.excelType) {
            await router.generateExcelPaymentReport(dataToReport, req.body, res, username);
        } else if (req.body.pdfType) {
            await router.generatePDFPaymentReport(dataToReport, req.body, res, username);
        } else {
            res.status(200).json({
                message: 'Report data fetched successfully', data: dataToReport
            });
        }
    } catch (error) {
        console.error('Error generating Paiement report:', error);
        res.status(500).json({error: 'Error generating report'});
    }
});
router.getPaymentReportData = async function (options) {
    let criteria = {where: {}};
    if (!tools.isFalsey(options.dateRule)) {
        let startOfDay = new Date(options.startDate).setHours(0, 0, 0, 0);
        let endOfDay = new Date(options.startDate).setHours(23, 59, 59, 999);
        switch (options.dateRule) {
            case 'equals' : {
                criteria.where.date = {'>=': startOfDay, '<=': endOfDay};
                break;
            }
            case 'notEquals' : {
                criteria.where.date = {'!': options.startDate};
                break;
            }
            case 'lowerThan' : {
                criteria.where.date = {'<=': endOfDay};
                break;
            }
            case 'greaterThan' : {
                criteria.where.date = {'>=': startOfDay};
                break;
            }
            case 'between' : {
                criteria.where.date = {'>=': startOfDay, '<=': new Date(options.endDate).setHours(23, 59, 59, 999)};
                break;
            }
            case 'debut':
            default:
                break;
        }
    }
    if (!tools.isFalsey(options.merchant))
        criteria.where.merchantId = options.merchant;


    let payment = await dao.find(criteria);
    return payment;

}
router.generateReportTitlePayment = async function (filter, username) {
    const {merchant, startDate, endDate, dateRule} = filter;
    let title = 'État de paiement des commerçants';
    let period = '';
    let merchantName = '';

    if (merchant) {
        const merchantData = await Merchant.findByPk(merchant);
        if (merchantData) {
            title = `État de paiement du commerçant : ${merchantData.name.toUpperCase()}`;
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

   // reportTitle.push(title);
    const generationDate = `Édité le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}\nPar : ${username || ""}`;

    return {
        title, period, generationDate,
    };
}
router.generatePDFPaymentReport = async function (data, filter, res, username) {
    const {title, period, generationDate} = await router.generateReportTitlePayment(filter, username);
    let titleRow = [];
    titleRow.push([
        !filter.merchant ? {text: 'Client', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}: null,
        {text: 'Date', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Montant', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Type', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Numéro', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Echéance', fontSize: 10, alignment: 'center', bold: true, fillColor: '#E8EDF0'},
        {text: 'Signataire', fontSize:10, alignment: 'center', bold: true, fillColor: '#E8EDF0'}
    ].filter(Boolean));

    const filteredData = data.filter(payment => {
        if (!filter.merchant) return true;

        return (!filter.merchant || payment.merchant?.id === filter.merchant);
    });
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
    let paymentReportData = [];
    let totalPriceSum = 0;
    const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
    Object.keys(groupedByMerchant).forEach(merchant => {
        const merchantGroup = groupedByMerchant[merchant];
        const groupedByDate = _.groupBy(merchantGroup, item =>  moment(item.date).format('DD-MM-YYYY'));
        Object.keys(groupedByDate).forEach(date => {
            const dateGroup = groupedByDate[date];
            let isFirstRow = true;
            const calculateMargin = (rowSpan, lineHeight = 2.5, fontSize = 9) => {
                if (rowSpan == 1)
                    return [0, 0, 0, 0];
                const totalRowHeight = rowSpan * fontSize * lineHeight;
                const cellHeight = fontSize;
                const verticalMargin = (totalRowHeight - cellHeight) / 2;
                return [0, verticalMargin, 0, verticalMargin];
            };

            dateGroup.forEach((payment, index) => {
                totalPriceSum +=payment.value;
                if (!payment.merchant?.name) return;
                const row = [
                    !filter.merchant ? (isFirstRow ? {text: payment.merchant?.name.toUpperCase(), rowSpan: merchantGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(merchantGroup.length)} : null) : null,
                    isFirstRow ? {text: moment(payment.date).format('DD-MM-YYYY'), rowSpan: dateGroup.length, fontSize: 9, alignment: 'center', margin: calculateMargin(dateGroup.length)} : null,
                    {text: payment.value.toLocaleString('fr-TN', {style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2}), fontSize: 9, alignment: 'right',margin: [0, 3]},
                    {text: payment.paymentType?.name, fontSize: 9, alignment: 'center',margin: [0, 3]},
                    {text: payment.number || '', fontSize: 9, alignment: 'center', margin: [0, 3]},
                    {text: payment.dueDate, fontSize: 9, alignment: 'center', margin: [0, 3]},
                    {text: payment.signatory , fontSize: 9, alignment: 'center', margin: [0, 3]}

                ].filter(Boolean);
                paymentReportData.push(row);
            });
        });
    });

    paymentReportData.push([{
        text: 'Total',
        fontSize: 10,
        alignment: 'center',
        bold: true,colSpan: 2 -  (filter.merchant ? 1 : 0) , margin: [0, 3]},
        ...(filter.merchant ? [] : ['']),
        {text: totalPriceSum.toLocaleString('fr-TN', {style: 'currency', currency: 'TND', minimumFractionDigits: 2}), fontSize: 8, alignment: 'right', bold: true, margin: [0, 3]},
         '','','',''
    ]);
    let docDefinition = {
        pageSize: 'A4',
        pageMargins: [25, 25, 25, 25],
        pageOrientation: 'portrait',
        defaultStyle: {
            fontSize: 10, columnGap: 20
        },
        content: [
            {
                text: title,
                fontSize: 14,
                alignment: 'center',
                decoration: 'underline',
                font: 'Roboto',
                bold: true,
                margin: [0, 20, 0, 10]
            },
            {text: period, fontSize: 14, alignment: 'center', margin: [0, 6]},
            {text: generationDate, fontSize: 10, alignment: 'right'},
                '\n',

            {
                columns: [{
                    table: {
                        headerRows: 1,
                        body: [...titleRow, ...paymentReportData],
                        widths: [!filter.merchant ? 80 : 0, 70, 80, 70, 70, 70, '*'].filter(Boolean),
                    }
                }],
            }
        ],
        footer: function (currentPage, pageCount) {
            return {
                columns: [
                    {
                        text: ` Page ${currentPage} / ${pageCount}`,
                        alignment: 'right',
                        margin: [0, 0, 40, 80],
                        fontSize: 10
                    }
                ]
            };
        }
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

    fileName = "etatPaiement.pdf";
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
router.generateExcelPaymentReport = async function (data, filter, res, username) {
    try {
        const {title, period, generationDate} = await router.generateReportTitlePayment(filter, username);

        let wb = new xl.Workbook();
        let ws = wb.addWorksheet('Rapport');
        const titleRow = [(!filter.merchant ? 'Client' : ''), 'Date', 'Montant',  'Type', 'Numéro ', 'Echéance', 'Signataire'].filter(Boolean);

        ws.cell(1, 1, 1, titleRow.length, true)
            .string(generationDate)
            .style({
                font: {name: 'Arial', italic: true, size: 10},
                alignment: {horizontal: 'right', vertical: 'center'}
            });
        ws.cell(2, 1, 2, titleRow.length, true)
            .string(title)
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
        ws.row(1).setHeight(30);
        ws.row(2).setHeight(40);
        ws.cell(4, 1).string('');

        const headerStyle = wb.createStyle({
            font: {bold: true, size: 10},
            alignment: {horizontal: 'center', vertical: 'center'},
            fill: {type: 'pattern', patternType: 'solid', fgColor: '#E8EDF0'},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'},}
        });
        const tableWidth = 100;
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
        const filteredData = data.filter(payment  => {
            return (!filter.merchant || payment.merchant?.id === filter.merchant) ;
        });
       // filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));
        let numberFormat = {numberFormat: '#,##0.00; (#,##0.00); -'};
        let integerFormat = {numberFormat: '#,##0; (#,##0); -'};
        let dateFormatStyle = {numberFormat: 'dd/mm/yyyy'};
        let currencyFormatStyle = {numberFormat: '_-* # ##0.00\\ [$TND]_-;-* # ##0.00\\ [$TND]_-;_-* "-"??\\ [$TND]_-;_-@_-'};

        let totalPriceSum = 0;
        const groupedByMerchant = _.groupBy(filteredData, item => item.merchant?.name);
        Object.keys(groupedByMerchant).forEach(merchant => {
            let isFirstMerchantRow = true;
            const merchantGroup = groupedByMerchant[merchant];
            const groupedByDate = _.groupBy(merchantGroup, item => moment(item.date).format('DD-MM-YYYY'));
            Object.keys(groupedByDate).forEach(date => {
                const dateGroup = groupedByDate[date];
               let isFirstDateRow = true;

                dateGroup.forEach((payment, index) => {
                          totalPriceSum += payment.value || 0;
                    if (!payment.merchant?.name) return;
                            if (!filter.merchant) {
                                if (isFirstMerchantRow) {
                                    ws.cell(rowIndex, 1, rowIndex + merchantGroup.length - 1, 1, true).string(payment.merchant?.name.toUpperCase()).style(rowStyle);
                                    ws.column(1).setWidth(20);
                                    isFirstMerchantRow = false;
                                }
                            }
                            if (isFirstDateRow) {
                                ws.cell(rowIndex, filter.merchant ? 1 : 2, rowIndex + dateGroup.length - 1, filter.merchant ? 1 : 2, true)
                                    .date(payment.date).style(dateFormatStyle)
                                    .style(rowStyle);
                                ws.column(filter.merchant ? 1 : 2).setWidth(8);
                                isFirstDateRow = false;
                            }

                            let colIndex = 2;
                            if (!filter.merchant)
                                colIndex++;
                            ws.cell(rowIndex, colIndex).number(payment.value).style(rowStyleRight).style(numberFormat);
                            ws.column(colIndex).setWidth(20);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(payment.paymentType?.name || '').style(rowStyle).style(integerFormat);
                            ws.column(colIndex).setWidth(10);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(payment.number  || 0).style(rowStyle).style(integerFormat);
                            ws.column(colIndex).setWidth(7);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(payment.dueDate  || '').style(rowStyle).style(dateFormatStyle);
                            ws.column(colIndex).setWidth(10);
                            colIndex++;
                            ws.cell(rowIndex, colIndex).string(payment.signatory || '').style(rowStyle).style(integerFormat);
                            ws.column(colIndex).setWidth(9);
                            rowIndex++;
                        });
                    });
                });


        let totalStartCol = 1;
        let totalEndCol = 2;
        if (filter.merchant) totalEndCol -= 1;

        const totalStyle = wb.createStyle({
            font: {size: 10, bold: true},
            alignment: {horizontal: 'center', vertical: 'center', wrapText: true},
            border: {top: {style: 'thin'}, left: {style: 'thin'}, bottom: {style: 'thin'}, right: {style: 'thin'}}
        });
        ws.cell(rowIndex, totalStartCol, rowIndex, totalEndCol, true).string('Total').style(totalStyle);
        totalEndCol++;
        ws.cell(rowIndex, totalEndCol).number(totalPriceSum).style(totalStyle).style(currencyFormatStyle);
        totalEndCol++;

        const fileName = "etatPaiemnt.xlsx";
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
