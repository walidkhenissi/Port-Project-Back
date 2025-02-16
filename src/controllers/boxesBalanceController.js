var router = require('express').Router();
const dao = require("../dao/boxesBalanceDao");
const Response = require("../utils/response");
const {sequelize, BoxesTransaction} = require("../models");
moment.locale('fr');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving boxesBalance :', error);
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
        console.error('Error retrieving boxesBalance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving boxesBalance :', error);
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
        balance.balance = balance.credit - balance.debit;
        const created = await dao.create(balance);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating boxesBalance :', error);
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
        balance.balance = balance.credit - balance.debit;
        const updated = await dao.update(balance);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating boxesBalance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing boxesBalance :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.updateByMerchant = async function (merchantId) {
    let result = await BoxesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('credit')), 'credit'],
            [sequelize.fn('sum', sequelize.col('merchantSalesCredit')), 'merchantSalesCredit'],
            [sequelize.fn('sum', sequelize.col('debit')), 'debit']
        ],
        raw: true,
        where: {merchantId: merchantId}
    });
    const _credit = (result && result.length) ? (result[0]["credit"] || 0) : 0;
    const _debit = (result && result.length) ? (result[0]["debit"] || 0) : 0;
    const _merchantSalesCredit = (result && result.length) ? (result[0]["merchantSalesCredit"] || 0) : 0;
    let balance = await dao.findOne({where: {merchantId: merchantId}});
    if (!balance)
        await dao.create({
            credit: _credit + _merchantSalesCredit,
            debit: _debit,
            balance: _credit + _merchantSalesCredit - _debit,
            merchantId: merchantId
        });
    else {
        balance.credit = _credit + _merchantSalesCredit;
        balance.debit = _debit;
        balance.balance = _credit + _merchantSalesCredit - _debit;
        await dao.update(balance);
    }
}

router.updateByShipOwner = async function (shipOwnerId) {
    let result = await BoxesTransaction.findAll({
        attributes: [
            [sequelize.fn('sum', sequelize.col('credit')), 'credit'],
            [sequelize.fn('sum', sequelize.col('debit')), 'debit'],
        ],
        raw: true,
        where: {shipOwnerId: shipOwnerId}
    });
    const _credit = (result && result.length) ? (result[0]["credit"] || 0) : 0;
    const _debit = (result && result.length) ? (result[0]["debit"] || 0) : 0;
    let balance = await dao.findOne({where: {shipOwnerId: shipOwnerId}});
    if (!balance)
        await dao.create({
            credit: _credit,
            debit: _debit,
            balance: _credit - _debit,
            shipOwnerId: shipOwnerId
        });
    else {
        balance.credit = _credit;
        balance.debit = _debit;
        balance.balance = _credit - _debit;
        await dao.update(balance);
    }
}

module.exports = router;
