var router = require('express').Router();
const dao = require("../dao/article Dao");
const Response = require("../utils/response");
const salesTransactionDao = require("../dao/salesTransactionDao");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving article :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    const criteria = req.body;
    try {
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        // console.log("=====================>count : " + JSON.stringify(count));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving article :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving article :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const beneficiary = req.body;
    try {
        const created = await dao.create(beneficiary);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating article :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const beneficiary = req.body;
    try {
        const updated = await dao.update(beneficiary);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating article :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        //Chek SalesTransactions
        const salesTransactionsCount = await salesTransactionDao.count({where: {articleId: id}});
        if (salesTransactionsCount && salesTransactionsCount > 0)
            return res.status(404).json(new Response({msg: "Impossible de supprimer l'article. Une ou plusieurs opération(s) de vente attachée(s)"}, true));
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing article :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});
module.exports = router;