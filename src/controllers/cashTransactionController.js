const router = require('express').Router();
const dao = require("../dao/cashTransactionDao");
const Response = require("../utils/response");
const {CashTransaction} = require("../models");
const {Op} = require("sequelize");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving cashTransaction :', error);
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
        console.error('Error retrieving cashTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving cashTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const cashTransaction = req.body;
    try {
        //cashTransaction.balance will be updated
        cashTransaction.balance = cashTransaction.balance || 0;
        cashTransaction.date = tools.refactorDate(cashTransaction.date);
        const created = await dao.create(cashTransaction);
        await router.updateBalance(cashTransaction.date);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating cashTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const cashTransaction = req.body;
    try {
        //cashTransaction.balance will be updated
        cashTransaction.balance = cashTransaction.balance || 0;
        cashTransaction.date = tools.refactorDate(cashTransaction.date);
        const updated = await dao.update(cashTransaction);
        await router.updateBalance(cashTransaction.date);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating cashTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        let cashTransaction = await dao.findOne({where: {id: id}});
        if (!cashTransaction) return res.status(404).json(new Response({error: '#NOT_FOUND_ERROR'}, true));
        let removed = await router.remove(cashTransaction);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing cashTransaction :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.remove = async function (cashTransaction) {
    const removed = await dao.remove(cashTransaction.id);
    await router.updateBalance(cashTransaction.date);
    return removed;
}
router.updateBalance = async function (date) {
    const previousTransaction = await CashTransaction.findOne({
        where: {
            date: {[Op.lte]: moment(date).add(-1, 'day').endOf('day').toDate()}
        }, limit: 1, order: [['date', 'DESC']]
    });
    // console.log("=====================>previousTransaction : " + JSON.stringify(previousTransaction));
    let previousBalance = previousTransaction ? previousTransaction.balance : 0;
    const nextTransactions = await dao.find({
        where: {date: {'>': moment(date).add(-1, 'day').endOf('day').toDate()}}, sort: {date: 'ASC'}
    });
    for (const key in nextTransactions) {
        let transaction = nextTransactions[key];
        transaction.balance = Number(parseFloat(previousBalance + transaction.credit - transaction.debit).toFixed(3));
        await dao.update(transaction);
        previousBalance = transaction.balance;
    }
}

module.exports = router;
