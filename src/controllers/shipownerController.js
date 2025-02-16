var router = require('express').Router();
const dao = require("../dao/shipOwnerDao");
const merchantController = require("../controllers/merchant/merchantController");
const boatDao = require("../dao/boatDao");
const saleDao = require("../dao/saleDao");
const balanceDao = require("../dao/balanceDao");
const Response = require("../utils/response");
moment.locale('fr');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving shipowner :', error);
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
        console.error('Error retrieving shipowner :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/findProducer', async (req, res) => {
    let criteria = req.body;
    try {
        const clonedCriteria = JSON.parse(JSON.stringify(criteria));
        const data1 = await dao.find(criteria);
        for (const key in data1) {
            let shipOwner = JSON.parse(JSON.stringify(data1[key]));
            shipOwner.isShipOwner = true;
            data1[key] = shipOwner;
        }
        const data2 = await merchantController.find(clonedCriteria);
        for (const key in data2) {
            let merchant = JSON.parse(JSON.stringify(data2[key]));
            merchant.isMerchant = true;
            data2[key] = merchant;
        }
        let result = _.union(data1, data2);
        result = _.take(result, criteria.limit);
        const count = result.length;
        const response = new Response();
        response.data = result;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving shipowner :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving shipowner :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const shipowner = req.body;
    try {
        const created = await dao.create(shipowner);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating shipowner :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const shipowner = req.body;
    try {
        const updated = await dao.update(shipowner);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating shipowner :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        //ChekSales
        const salesCount = await saleDao.count({where: {shipOwnerId: id}});
        if (salesCount && salesCount > 0)
            return res.status(404).json(new Response({msg: "Impossible de supprimer l'armateur. Une ou plusieurs vente(s) attachée(s)"}, true));
        //Chek attached Boats
        const boatsCount = await boatDao.count({where: {shipOwnerId: id}});
        if (boatsCount && boatsCount > 0)
            return res.status(404).json(new Response({msg: "Impossible de supprimer l'armateur. Un ou plusieurs bateau(x) attaché(s)"}, true));
        //Check balance
        const balances = await balanceDao.list({where: {shipOwnerId: id}});
        for (const balancesKey in balances) {
            const balance = balances[balancesKey];
            await balance.destroy();
        }
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing shipowner :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});
module.exports = router;
