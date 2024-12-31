var router = require('express').Router();
const dao = require("../dao/balanceDao");
const beneficiaryDao = require("../dao/beneficiaryDao");
const saleDao = require("../dao/saleDao");
const salePaymentDao = require("../dao/salePaymentDao");
const commissionBeneficiaryController = require("../controllers/commissionBeneficiaryController");
const Response = require("../utils/response");
const {
    Sale,
    SalesTransaction,
    sequelize,
    BeneficiaryBalance,
    CommissionValue,
    Beneficiary,
    Payment, SalePayment
} = require("../models");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving balance :', error);
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
        console.error('Error retrieving balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const balance = req.body;
    try {
        if (!_.isNumber(balance.credit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!_.isNumber(balance.debit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        balance.balance = Number(parseFloat(balance.credit - balance.debit).toFixed(3));
        const created = await dao.create(balance);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const balance = req.body;
    try {
        if (!_.isNumber(balance.credit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!_.isNumber(balance.debit))
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        balance.balance = Number(parseFloat(balance.credit - balance.debit).toFixed(3));
        const updated = await dao.update(balance);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing balance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.updateByShipOwnerAsProducer = async function (shipOwnerId, date = new Date()) {
    // console.log("=====================>updateByShipOwnerAsProducer : " + JSON.stringify(shipOwnerId));
    let balance = await dao.find({where: {shipOwnerId: shipOwnerId}});
    if (!balance || !balance.length)
        balance = await dao.create({
            credit: 0,
            debit: 0,
            producerCommission: 0,
            merchantCommission: 0,
            balance: 0,
            shipOwnerId: shipOwnerId
        });
    else
        balance = balance[0];
    let result = await Sale.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('totalToPay')), 'totalToPay'],
            [sequelize.fn('sum', sequelize.col('totalProducerCommission')), 'totalProducerCommission'],
        ],
        raw: true,
        where: {shipOwnerId: shipOwnerId}
    });
    // console.log("=====================>balance before update : " + JSON.stringify(balance));
    const totalToPay = Number(parseFloat((result && result.length) ? (result[0]["totalToPay"] || 0) : 0).toFixed(3));
    const totalProducerCommission = Number(parseFloat((result && result.length) ? (result[0]["totalProducerCommission"] || 0) : 0).toFixed(3));
    balance.credit = totalToPay;
    balance.producerCommission = totalProducerCommission;
    let salesIds = await Sale.findAll({
        attributes: ['id'],
        where: {shipOwnerId: shipOwnerId}
    });
    const totalPaymentsAmount = await SalePayment.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('value')), 'value']
        ],
        raw: true,
        where: {saleId: _.keys(_.keyBy(salesIds, 'id')).map(Number)}
    });
    const totalPayments = (totalPaymentsAmount && totalPaymentsAmount.length) ? (totalPaymentsAmount[0]["value"] || 0) : 0;
    // console.log("=====================>totalPayments : " + JSON.stringify(totalPayments));
    balance.debit = totalPayments;
    balance.balance = Number(parseFloat(balance.credit - (balance.debit || 0)).toFixed(3));
    // console.log("=====================>balance to update : " + JSON.stringify(balance));
    const updated = await dao.update(balance);
    // await router.updateBeneficiaryCommissionsBalance(date);
    return updated;
}

router.updateMerchantBalance = async function (merchantId, date = new Date()) {
    let balance = await dao.find({where: {merchantId: merchantId}});
    if (!balance || !balance.length)
        balance = await dao.create({
            credit: 0,
            debit: 0,
            producerCommission: 0,
            merchantCommission: 0,
            balance: 0,
            merchantId: merchantId
        });
    else
        balance = balance[0];
    const totalSalesAmount = await Sale.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('totalToPay')), 'totalToPay'],
            [sequelize.fn('sum', sequelize.col('totalProducerCommission')), 'totalProducerCommission'],
        ],
        raw: true,
        where: {merchantId: merchantId}
    });
    const totalToPay = Number(parseFloat((totalSalesAmount && totalSalesAmount.length) ? (totalSalesAmount[0]["totalToPay"] || 0) : 0).toFixed(3));
    const totalProducerCommission = Number(parseFloat((totalSalesAmount && totalSalesAmount.length) ? (totalSalesAmount[0]["totalProducerCommission"] || 0) : 0).toFixed(3));
    balance.credit = totalToPay;
    balance.producerCommission = totalProducerCommission;
    const totalPaymentsAmount = await Payment.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('value')), 'value']
        ],
        raw: true,
        where: {merchantId: merchantId, isCommissionnaryPayment: false}
    });
    const totalPayments = (totalPaymentsAmount && totalPaymentsAmount.length) ? (totalPaymentsAmount[0]["value"] || 0) : 0;
    balance.credit += totalPayments;
    const totalPurchasesAmount = await SalesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('totalPrice')), 'totalPrice'],
            [sequelize.fn('sum', sequelize.col('merchantCommission')), 'merchantCommission'],
        ],
        raw: true,
        where: {merchantId: merchantId}
    });
    const totalPurchasesPrice = Number(parseFloat((totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["totalPrice"] || 0) : 0).toFixed(3));
    const totalMerchantCommissions = Number(parseFloat((totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["merchantCommission"] || 0) : 0).toFixed(3));
    // console.log("=====================>totalPurchasesPrice : " + JSON.stringify(totalPurchasesPrice));
    balance.debit = Number(parseFloat(totalPurchasesPrice + totalMerchantCommissions).toFixed(3));
    balance.merchantCommission = totalMerchantCommissions;
    balance.balance = Number(parseFloat((balance.credit || 0) - (balance.debit || 0)).toFixed(3));
    const updated = await dao.update(balance);
    // await router.updateBeneficiaryCommissionsBalance(date);
    return updated;
}

// router.updateByMerchantAsCustomer = async function (merchantId, date = new Date()) {
//     // console.log("=====================>updateByMerchantAsCustomer : " + JSON.stringify(date));
//     let balance = await dao.find({where: {merchantId: merchantId}});
//     if (!balance || !balance.length)
//         balance = await dao.create({
//             credit: 0,
//             debit: 0,
//             balance: 0,
//             merchantId: merchantId
//         });
//     else
//         balance = balance[0];
//     const totalPurchasesAmount = await SalesTransaction.findAll({
//         attributes: [
//             [sequelize.fn('sum', sequelize.col('totalPrice')), 'totalPrice'],
//             [sequelize.fn('sum', sequelize.col('merchantCommission')), 'merchantCommission'],
//         ],
//         raw: true,
//         where: {merchantId: merchantId}
//     });
//     const totalPrice = (totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["totalPrice"] || 0) : 0;
//     const totalCommissions = (totalPurchasesAmount && totalPurchasesAmount.length) ? (totalPurchasesAmount[0]["merchantCommission"] || 0) : 0;
//     // console.log("=====================>totalPrice : " + JSON.stringify(totalPrice));
//     balance.debit = totalPrice + totalCommissions;
//     balance.merchantCommission = totalCommissions;
//     //TODO : calculate total debit when managing payments
//     balance.balance = (balance.credit || 0) - balance.debit;
//     const updated = await dao.update(balance);
//     // await router.updateBeneficiaryCommissionsBalance(date);
//     return updated;
// }

router.updateBeneficiaryCommissionsBalance = async function (date) {
    const beneficiaries = await beneficiaryDao.list();
    let beneficiaryBalances = [];
    for (let i in beneficiaries) {
        const beneficiary = beneficiaries[i];
        let balance = await BeneficiaryBalance.findAll({where: {beneficiaryId: beneficiary.id}});
        if (!balance || !balance.length) {
            const transaction = await sequelize.transaction();
            balance = await BeneficiaryBalance.create({
                credit: 0,
                debit: 0,
                producerCommission: 0,
                merchantCommission: 0,
                balance: 0,
                beneficiaryId: beneficiary.id
            }, {transaction});
            await transaction.commit();
        } else
            balance = balance[0];
        beneficiaryBalances.push(balance);
    }
    const beneficiaryBalancesById = _.groupBy(beneficiaryBalances, 'beneficiaryId');
    const commissionController = require("../controllers/commissionController");
    const availableCommissions = await commissionController.getAvailableCommissionsAtDate(date);
    const availableCommissionBeneficiaries = await commissionBeneficiaryController.getAvailableCommissionBeneficiariesAtDate(date);
    for (let i in beneficiaries) {
        const beneficiary = beneficiaries[i];
        let beneficiaryBalance = beneficiaryBalancesById[beneficiary.id];
        const beneficiaryCommissions = _.filter(availableCommissionBeneficiaries, function (item) {
            return item.beneficiaryId == beneficiary.id;
        });
        const beneficiaryCommissionIds = _.keys(_.keyBy(beneficiaryCommissions, 'commissionId')).map(Number);
        const beneficiaryProducerCommissionsIds = _.keys(_.keyBy(_.filter(availableCommissions, function (item) {
            return beneficiaryCommissionIds.includes(item.commissionId) && item.isSellerCommission;
        }), 'Commission.id')).map(Number)
        let totalProducerCommissions = await CommissionValue.findAll({
            attributes: [
                [sequelize.fn('sum', sequelize.col('value')), 'value']
            ],
            raw: true,
            where: {commissionId: beneficiaryProducerCommissionsIds}
        });
        const beneficiaryCustomerCommissionsIds = _.keys(_.keyBy(_.filter(availableCommissions, function (item) {
            return beneficiaryCommissionIds.includes(item.commissionId) && item.isCustomerCommission;
        }), 'Commission.id')).map(Number)
        let totalCustomerCommissions = await CommissionValue.findAll({
            attributes: [
                [sequelize.fn('sum', sequelize.col('value')), 'value']
            ],
            raw: true,
            where: {commissionId: beneficiaryCustomerCommissionsIds}
        });
        totalProducerCommissions = (totalProducerCommissions && totalProducerCommissions.length) ? (totalProducerCommissions[0]["value"] || 0) : 0;
        totalCustomerCommissions = (totalCustomerCommissions && totalCustomerCommissions.length) ? (totalCustomerCommissions[0]["value"] || 0) : 0;
        beneficiaryBalance.producerCommission = totalProducerCommissions;
        beneficiaryBalance.merchantCommission = totalCustomerCommissions;
        beneficiaryBalance.credit = Number(parseFloat(totalProducerCommissions + totalCustomerCommissions).toFixed(3));
        beneficiaryBalance.balance = Number(parseFloat(beneficiaryBalance.credit - (beneficiaryBalance.debit || 0)).toFixed(3));

        const oldBeneficiaryBalance = await BeneficiaryBalance.findOne({where: {beneficiaryId: beneficiary.id}});
        if (!oldBeneficiaryBalance) {
            console.error('beneficiary not found error');
            return null;
        }
        try {
            _.assign(oldBeneficiaryBalance, beneficiaryBalance);
            await oldBeneficiaryBalance.save();
            // return oldBeneficiaryBalance;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    }


}

module.exports = router;
