const router = require('express').Router();
const dao = require("../dao/bankDao");
const Response = require("../utils/response");
const {Payment} = require("../models");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving bank :', error);
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
        console.error('Error retrieving bank :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving bank :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const commission = req.body;
    try {
        const created = await dao.create(commission);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating bank :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const bank = req.body;
    try {
        const updated = await dao.update(bank);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating bank :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const payment = await Payment.findAll({where: {bankId: id}, limit: 1});
        if (payment && payment.length)
            return res.status(404).json(new Response({errorCode: '#USED_DATA_ERROR'}, true));
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing bank :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

module.exports = router;
