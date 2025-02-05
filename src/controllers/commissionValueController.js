var router = require('express').Router();
const dao = require("../dao/commissionValueDao");
const saleDao = require("../dao/saleDao");
const commissionBeneficiaryController = require("../controllers/commissionBeneficiaryController");
const Response = require("../utils/response");
const {SalesTransaction, sequelize, CommissionValue} = require("../models");
const _ = require("lodash");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving commissionValues :', error);
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
        console.error('Error retrieving commissionValuess :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    let commissionValue = req.body;
    try {
        try {
            router.checkDataConstraints(commissionValue);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        if (tools.isFalsey(commissionValue.date))
            commissionValue.date = new Date();
        const createdCommissionValue = await dao.create(commissionValue);
        res.status(201).json(new Response(createdCommissionValue));
    } catch (error) {
        console.error('Error creating commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    let commissionValue = req.body;
    try {
        try {
            router.checkDataConstraints(commissionValue);
        } catch (e) {
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        }
        if (tools.isFalsey(commissionValue.date))
            commissionValue.date = new Date();
        const updated = await dao.update(commissionValue);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing commissionValue :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.checkDataConstraints = function (commissionValue) {
    let isError = false;
    if (!commissionValue.commissionId)
        isError = true;
    else if (!commissionValue.salesTransactionId)
        isError = true;
    if (isError) {
        const error = new Error('Data contraints error');
        console.error(error.message);
        throw error;
    }
}

router.updateCommissionValuesBySaleTransaction = async function (saleTransaction) {
    try {
        const commissionController = require("../controllers/commissionController");
        let availableCommissionsHistories = await commissionController.getAvailableCommissionsAtDate(saleTransaction.sale.date, null);
        await CommissionValue.destroy({where: {salesTransactionId: saleTransaction.id}});
        let commissionValues = [];
        for (let item in availableCommissionsHistories) {
            const commissionHistory = availableCommissionsHistories[item];
            let comValue = 0;
            if (commissionHistory.isPercentValue)
                comValue = saleTransaction.totalPrice * commissionHistory.value;
            else if (commissionHistory.isPerUnitValue)
                comValue = saleTransaction.boxes * commissionHistory.value;
            if (comValue > 0) {
                let commissionValue = await dao.create({
                    value: Number(parseFloat(comValue).toFixed(3)),
                    date: saleTransaction.date,
                    commissionId: commissionHistory.Commission.id,
                    salesTransactionId: saleTransaction.id
                });
                commissionValues.push(commissionValue);
            }
        }
        return commissionValues;
    } catch (error) {
        const msg = 'Error updating commission values for saleTransaction';
        console.error(msg, error);
        throw new Error(msg);
    }
}

router.post('/findWithDetails', async (req, res) => {
    let criteria = req.body;
    try {
        //Possible criteria :
        //commissionBeneficiaryId
        //date
        //value
        //commissionId
        //
        let commissionIds = [];
        criteria.where = criteria.where || {};
        if (criteria.where.commissionBeneficiaryId) {
            let date = new Date();
            if (criteria.where.date)
                date = criteria.where.date;
            let availableCommissionBeneficiaries = await commissionBeneficiaryController.getAvailableCommissionBeneficiariesAtDate(date);
            let commissionBeneficiaries = _.filter(availableCommissionBeneficiaries, function (item) {
                return item.beneficiaryId == criteria.where.commissionBeneficiaryId;
            });
            commissionIds = _.keys(_.keyBy(commissionBeneficiaries, 'commissionId')).map(Number);
            delete criteria.where.commissionBeneficiaryId;
        }
        if (criteria.where.commissionId) {
            let temp = [];
            for (let item in criteria.where.commissionId) {
                let id = criteria.where.commissionId[item];
                if (commissionIds.includes(id)) {
                    temp.push(id);
                }
            }
            commissionIds = temp;
            if (!commissionIds.length)
                commissionIds = [-1];//any chosen commissionId belongs to chosen commissionBeneficiaryId
        }
        if (commissionIds.length)
            criteria.where.commissionId = commissionIds;
        const whereCriteria = _.clone(criteria.where);
        const data = await dao.find(criteria);
        const count = await dao.count({where: whereCriteria});
        const sum = await dao.sum({where: {id:_.map(data, 'id')}});
        // console.log("=====================>data : " + JSON.stringify(data));
        const response = new Response();
        response.data = data;
        response.metaData.count = count;
        response.metaData.sum = sum;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving commissionValuess :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

module.exports = router;
