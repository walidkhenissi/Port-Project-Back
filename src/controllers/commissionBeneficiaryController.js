var router = require('express').Router();
const dao = require("../dao/commissionBeneficiaryDao");
const {Op, QueryTypes} = require("sequelize");
const Response = require("../utils/response");
const {
    Commission,
    Beneficiary,
    CommissionBeneficiary,
    sequelize
} = require("../models");

router.get('/list', async (req, res) => {
    let criteria = req.body;
    try {
        const list = await dao.list(criteria);
        res.status(200).json(new Response(list));
    } catch (error) {
        console.error('Error retrieving commissionBeneficiary :', error);
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
        console.error('Error retrieving commissionBeneficiary :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/get', async (req, res) => {
    const id = req.query.id;
    try {
        const found = await dao.get(id);
        res.status(201).json(new Response(found));
    } catch (error) {
        console.error('Error retrieving commissionBeneficiary :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/create', async (req, res) => {
    const commissionBeneficiary = req.body;
    try {
        if (!commissionBeneficiary.startDate)
            return res.status(404).json(new Response({errorCode: '#DATE_CREDENTIAL_ERROR'}, true));
        if (!commissionBeneficiary.beneficiaryId)
            return res.status(404).json(new Response({errorCode: '#DATA_CREDENTIAL_ERROR'}, true));
        if (!commissionBeneficiary.commissionId)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (commissionBeneficiary.endDate)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        let data = await dao.find({
            where: {
                commissionId: commissionBeneficiary.commissionId,
                [Op.or]: [
                    {startDate: {[Op.lte]: commissionBeneficiary.startDate}, endDate: {[Op.is]: null}},
                    {endDate: {[Op.gte]: commissionBeneficiary.startDate}}
                ]
            }
        });
        if (data.length > 0)
            return res.status(404).json(new Response({errorCode: '#DATA_CREDENTIAL_ERROR'}, true));
        //Check if there is commissionBeneficiaries to enclose.
        data = await dao.find({
            where: {
                commissionId: commissionBeneficiary.commissionId,
                endDate: {[Op.is]: null}
            }
        });
        if (data.result && data.result.length > 0)
            data.result.forEach(
                async (comBenef) => {
                    comBenef.endDate = moment(commissionBeneficiary.startDate || moment.now()).add(-1, 'days');
                    await comBenef.save();
                });
        //Create the new commissionBeneficiary
        const created = await dao.create(commissionBeneficiary);
        res.status(201).json(new Response(created));
    } catch (error) {
        console.error('Error creating commissionBeneficiary :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const commissionBeneficiary = req.body;
    try {
        const oldCommissionBeneficiary = await dao.get(commissionBeneficiary.id);
        if (!oldCommissionBeneficiary)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (!commissionBeneficiary.startDate)
            return res.status(404).json(new Response({errorCode: '#DATE_CREDENTIAL_ERROR'}, true));
        if (!commissionBeneficiary.beneficiaryId)
            return res.status(404).json(new Response({errorCode: '#DATA_CREDENTIAL_ERROR'}, true));
        if (!commissionBeneficiary.commissionId)
            return res.status(404).json(new Response({errorCode: '#INTERNAL_ERROR'}, true));
        if (commissionBeneficiary.endDate && moment(commissionBeneficiary.endDate).isBefore(commissionBeneficiary.startDate))
            return res.status(404).json(new Response({errorCode: '#DATE_CREDENTIAL_ERROR'}, true));
        const data = await dao.find({
            where: {
                id: {'!=': commissionBeneficiary.id},
                commissionId: commissionBeneficiary.commissionId,
                [Op.or]: [{startDate: {[Op.lte]: commissionBeneficiary.startDate}, endDate: {[Op.is]: null}},
                    {endDate: {[Op.gte]: commissionBeneficiary.startDate}}
                ]
            }
        });
        if (data.length > 0)
            return res.status(404).json(new Response({errorCode: '#DATA_CREDENTIAL_ERROR'}, true));
        //Check the closing date in case of closing commissionHistory
        if (!oldCommissionBeneficiary.endDate && commissionBeneficiary.endDate) {
            let query = "select * from commissionvalues cv " +
                "inner join salesTransactions st on cv.salesTransactionId = st.id  " +
                "inner join sales s on  st.saleId=s.id " +
                "inner join commissionbeneficiaries cb on cv.commissionId=cb.commissionId " +
                "where " +
                "cb.id = " + oldCommissionBeneficiary.id +
                " and s.date >= '" + moment(commissionBeneficiary.endDate).add(1, 'days').format(dbDateFormat) +
                "' limit 1";
            const result = await sequelize.query(query, {
                type: QueryTypes.SELECT, raw: true
            });
            if (result && result.length)
                return res.status(404).json(new Response({errorCode: '#DATE_CONSTRAINT_ERROR'}, true));
        }
        const updated = await dao.update(commissionBeneficiary);
        res.status(201).json(new Response(updated));
    } catch (error) {
        console.error('Error updating commissionBeneficiary :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.delete('/remove', async (req, res) => {
    const id = req.query.id;

    try {
        let query = "select * from commissionvalues cv " +
            "inner join salesTransactions st on cv.salesTransactionId = st.id " +
            "inner join sales s on  st.saleId=s.id " +
            "inner join commissionbeneficiaries cb on cv.commissionId=cb.commissionId " +
            "where " +
            "cb.id = " + id +
            " and (" +
            "(s.date>=cb.startDate and cb.endDate is null) " +
            "or " +
            "(s.date>=cb.startDate and cb.endDate is not null and s.date<=cb.endDate )" +
            ") limit 1";
        const result = await sequelize.query(query, {
            type: QueryTypes.SELECT, raw: true
        });
        if (result && result.length)
            return res.status(404).json(new Response({errorCode: '#USED_DATA_ERROR'}, true));
        const removed = await dao.remove(id);
        res.status(201).json(new Response(removed));
    } catch (error) {
        console.error('Error removing commissionBeneficiary :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.getAvailableCommissionBeneficiariesAtDate = async function (date, commissionId = null) {
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
            include: [{model: Commission, as: 'Commission'}, {model: Beneficiary, as: 'Beneficiary'}],
        };
        if (commissionId)
            criteria.where.commissionId = commissionId;
        const availableCommissionBeneficiaries = await CommissionBeneficiary.findAll(criteria);
        if (!availableCommissionBeneficiaries || !availableCommissionBeneficiaries.length)
            return null;
        if (commissionId)
            return availableCommissionBeneficiaries[0];
        return availableCommissionBeneficiaries;
    } catch (error) {
        const msg = 'Error retrieving available commission beneficiaries at date : ' + date;
        console.error(msg, error);
        throw new Error('Error retrieving available commission beneficiaries at date : ' + date);
    }
};
module.exports = router;
