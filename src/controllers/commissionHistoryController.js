var router = require('express').Router();
const dao = require("../dao/commissionHistoryDao");
const {Op, QueryTypes} = require("sequelize");
const Response = require("../utils/response");
const {sequelize} = require("../models");
moment.locale('fr');

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving commissionHistory :', error);
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
        console.error('Error retrieving commissionHistory :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving commissionHistory :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const commissionHistory = req.body;
    try {
        if (!commissionHistory.startDate)
            return res.status(404).json(new Response({errorCode: '#DATE_CREDENTIAL_ERROR'}, true));
        if (!commissionHistory.commissionId)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (commissionHistory.endDate)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        let data = await dao.find({
            where: {
                commissionId: commissionHistory.commissionId,
                [Op.or]: [
                    {startDate: {[Op.lte]: commissionHistory.startDate}, endDate:{[Op.is]:null}},
                    {endDate: {[Op.gte]: commissionHistory.startDate}}]
            }
        });
        if (data.length > 0)
            return res.status(404).json(new Response({errorCode: '#DATA_CREDENTIAL_ERROR'}, true));
        //Check if there is commissionHistories to enclose.
        data = await dao.find({where: {commissionId: commissionHistory.commissionId, endDate: {[Op.is]: null}}});
        if (data && data.result && data.result.length)
            data.result.forEach(
                async (comHistory) => {
                    comHistory.endDate = moment(commissionHistory.startDate || moment.now()).add(-1, 'days');
                    await comHistory.save();
                });
        //Create the new commissionHistory
        commissionHistory.value=Number(parseFloat(commissionHistory.value).toFixed(3));
        const created = await dao.create(commissionHistory);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating commissionHistory :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const commissionHistory = req.body;
    try {
        const oldCommissionHistory = await dao.get(commissionHistory.id);
        if (!oldCommissionHistory)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!commissionHistory.startDate)
            return res.status(404).json(new Response({errorCode: '#DATE_CREDENTIAL_ERROR'}, true));
        if (!commissionHistory.commissionId)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (commissionHistory.endDate && moment(commissionHistory.endDate).isBefore(commissionHistory.startDate))
            return res.status(404).json(new Response({errorCode: '#DATE_CREDENTIAL_ERROR'}, true));
        //Check date's overlap with other histories commission
        const data = await dao.find({
            where: {
                id: {'!=': commissionHistory.id},
                commissionId: commissionHistory.commissionId,
                [Op.or]: [
                    {startDate: {[Op.lte]: commissionHistory.startDate}, endDate:{[Op.is]:null}},
                    {endDate: {[Op.gte]: commissionHistory.startDate}}]
            }
        });
        if (data.length > 0)
            return res.status(404).json(new Response({errorCode: '#DATA_CREDENTIAL_ERROR'}, true));
        //Check the closing date in case of closing commissionHistory
        if (!oldCommissionHistory.endDate && commissionHistory.endDate) {
            let query = "select * from commissionvalues cv " +
                "inner join salesTransactions st on cv.salesTransactionId = st.id  " +
                "inner join sales s on  st.saleId=s.id " +
                "inner join commissionHistories ch on cv.commissionId=ch.commissionId " +
                "where " +
                "ch.id = " + oldCommissionHistory.id+
            " and s.date >= '" + moment(commissionHistory.endDate).add(1, 'days').format("YYYY-MM-DD")+
            "' limit 1";
            const result = await sequelize.query(query, {
                type: QueryTypes.SELECT, raw: true
            });
            if (result && result.length)
                return res.status(404).json(new Response({errorCode: '#DATE_CONSTRAINT_ERROR'}, true));
        }
        commissionHistory.value=Number(parseFloat(commissionHistory.value).toFixed(3));
        const updated = await dao.update(commissionHistory);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating commissionHistory :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        //Chek commissionValues
        let query = "select * from commissionvalues cv " +
            "inner join salesTransactions st on cv.salesTransactionId = st.id  " +
            "inner join sales s on  st.saleId=s.id " +
            "inner join commissionHistories ch on cv.commissionId=ch.commissionId " +
            "where " +
            "ch.id = " + id +
            " and (" +
            "(s.date>=ch.startDate and ch.endDate is null) " +
            "or " +
            "(s.date>=ch.startDate and ch.endDate is not null and s.date<=ch.endDate ) " +
            ") " +
            "limit 1"
        const result = await sequelize.query(query, {
            type: QueryTypes.SELECT, raw: true
        });
        if (result && result.length)
            return res.status(404).json(new Response({errorCode: '#USED_DATA_ERROR'}, true));
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing commissionHistory :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});
module.exports = router;
