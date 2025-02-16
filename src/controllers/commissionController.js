var router = require('express').Router();
const dao = require("../dao/commissionDao");
const Response = require("../utils/response");
const {Op} = require("sequelize");
const {CommissionHistory, Commission, CommissionValue, Sale, sequelize, SalesTransaction} = require("../models");
const salesTransactionDao = require("../dao/salesTransactionDao");
const commissionValueDao = require("../dao/commissionValueDao");
const commissionValueController = require("../controllers/commissionValueController");
const saleController = require("../controllers/saleController");
moment.locale('fr');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving commission :', error);
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
        console.error('Error retrieving commission :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving commission :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const commission = req.body;
    try {
        const created = await dao.create(commission);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating commission :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const commission = req.body;
    try {
        const updated = await dao.update(commission);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating commission :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const commissionValue = await commissionValueDao.find({where: {commissionId: id}, limit: 1});
        if (commissionValue && commissionValue.length)
            return res.status(404).json(new Response({errorCode: '#USED_DATA_ERROR'}, true));
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing commission :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/getAvailableCommissionsAtDate', async (req, res) => {
    let criteria = req.body;
    let date = criteria.date;
    let commissionId = criteria.commissionId || null;
    try {
        const availableCommissionHistories = router.getAvailableCommissionsAtDate(date, commissionId);
        res.status(200).json(new Response(availableCommissionHistories));
    } catch (error) {
        console.error('Error retrieving available commissions :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});


router.getAvailableCommissionsAtDate = async function (date, commissionId = null) {
    try {
        if (!date || !moment.isDate(date))
            date = moment(new Date());
        let criteria = {
            where: {
                startDate: {[Op.lte]: moment(date).toDate()},//<=
                [Op.or]: [{endDate: {[Op.eq]: null}},
                    {endDate: {[Op.gte]: moment(date).toDate()}}//>=
                ]
            },
            include: [{model: Commission, as: 'Commission'}]
        };
        if (commissionId)
            criteria.where.commissionId = commissionId;
        // console.log("=====================>criteria : " + JSON.stringify(criteria));
        const availableCommissionHistories = await CommissionHistory.findAll(criteria);
        if (!availableCommissionHistories || !availableCommissionHistories.length)
            return null;
        if (commissionId)
            return availableCommissionHistories[0];
        return availableCommissionHistories;
    } catch (error) {
        const msg = 'Error retrieving available commissions at date : ' + date;
        console.error(msg, error);
        throw new Error('Error retrieving available commissions at date : ' + date);
    }
};

router.updateCommissionsBySaleTransaction = async function (saleTransactionId) {
    try {
        let saleTransaction = await salesTransactionDao.get(saleTransactionId);
        const commissionValues = await commissionValueController.updateCommissionValuesBySaleTransaction(saleTransaction);
        const availableCommissions = await router.getAvailableCommissionsAtDate(saleTransaction.sale.date);
        const producerCommissionsIds = _.keys(_.keyBy(_.filter(availableCommissions, function (commissionHistory) {
            return commissionHistory.isSellerCommission;
        }), 'Commission.id')).map(Number);
        const customerCommissionsIds = _.keys(_.keyBy(_.filter(availableCommissions, function (commissionHistory) {
            return commissionHistory.isCustomerCommission;
        }), 'Commission.id')).map(Number);
        //Manage salesTransaction commissions
        saleTransaction.producerCommission = Number(parseFloat(_.sumBy(_.filter(commissionValues, function (item) {
            return producerCommissionsIds.includes(item.commissionId);
        }), 'value')).toFixed(3));
        saleTransaction.merchantCommission = Number(parseFloat(_.sumBy(_.filter(commissionValues, function (item) {
            return customerCommissionsIds.includes(item.commissionId);
        }), 'value')).toFixed(3));
        saleTransaction.totalToPayToProducer = Number(parseFloat(saleTransaction.totalPrice - saleTransaction.producerCommission).toFixed(3));
        saleTransaction.totalToPayByMerchant = Number(parseFloat(saleTransaction.totalPrice + saleTransaction.merchantCommission).toFixed(3));
        saleTransaction.restMerchantPayment = Number(parseFloat(saleTransaction.totalToPayByMerchant - saleTransaction.totalMerchantPayment).toFixed(3));
        let updatedSaleTransaction = await salesTransactionDao.update(saleTransaction);
        //Manage sale commissions
        // let sale = router.calculateSaleCommissions(saleTransaction.sale);
        await saleController.update(saleTransaction.sale);
        return updatedSaleTransaction;
    } catch (error) {
        const msg = 'Error updating commissions for saleTransaction';
        console.error(msg, error);
        throw new Error(msg);
    }
}

router.calculateSaleCommissions = async function (sale) {
    let producerCommission = await SalesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('producerCommission')), 'totalProducerCommission'],
        ],
        raw: true,
        where: {saleId: sale.id}
    });
    producerCommission = Number(parseFloat((producerCommission && producerCommission.length) ? (producerCommission[0]["totalProducerCommission"] || 0) : 0).toFixed(3));
    sale.totalProducerCommission = producerCommission;
    let merchantCommission = await SalesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('merchantCommission')), 'totalMerchantCommission'],
        ],
        raw: true,
        where: {saleId: sale.id}
    });
    merchantCommission = Number(parseFloat((merchantCommission && merchantCommission.length) ? (merchantCommission[0]["totalMerchantCommission"] || 0) : 0).toFixed(3));
    sale.totalMerchantCommission = merchantCommission;
    sale.totalToPay = Number(parseFloat(sale.total - sale.totalProducerCommission).toFixed(3));
    return sale;
}

router.updateCommissionsBySale = async function (saleId) {
//Il faut gérer les cas de du producteur pour une vente
}
module.exports = router;
