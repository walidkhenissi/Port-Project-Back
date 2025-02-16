const router = require('express').Router();
const {sequelize} = require('../../../models');
const {BoatActivityType} = require('../../../models');
const Response = require("../../../utils/response");
const saleDao = require("../../../dao/saleDao");
const boatDao = require("../../../dao/boatDao");
moment.locale('fr');

router.post('/create', async (req, res) => {
    const activityType = req.body;

    try {
        const transaction = await sequelize.transaction();
        try {
            const newBoatActivityType = await BoatActivityType.create(activityType, {transaction});
            await transaction.commit();
            res.status(201).json(new Response(newBoatActivityType));
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error creating boatActivityType', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.put('/update', async (req, res) => {
    const activityType = req.body;
    try {
        const oldActivityType = await BoatActivityType.findByPk(activityType.id);
        if (!oldActivityType) {
            console.error('ActivityType not found error');
            return null;
        }
        oldActivityType.name = activityType.name;
        await oldActivityType.save();
        res.status(201).json(new Response(oldActivityType));
    } catch (error) {
        console.error('Error updating activityType :', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.post('/find', async (req, res) => {
    try {
        let criteria = req.body;

        criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
        const {count, rows: boatActivityTypes} = await BoatActivityType.findAndCountAll({
            where: criteria.where,
            limit: criteria.limit,
            offset: criteria.skip,
            order: criteria.sort
        });

        const response = new Response();
        response.data = boatActivityTypes;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving boat activity types:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

router.get('/list', async (req, res) => {
    try {
        const {count, rows: boatActivityTypes} = await BoatActivityType.findAndCountAll();
        const response = new Response();
        response.data = boatActivityTypes;
        response.metaData.count = count;
        res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving boat activity types:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});


router.delete('/remove', async (req, res) => {
    const id = req.query.id;
    try {
        const boatActivityType = await BoatActivityType.findByPk(id);
        if (!boatActivityType) {
            return res.status(404).json(new Response({error: 'Boat activity type not found'}, true));
        }
        //Chek boats
        const boatsCount = await boatDao.count({where: {boatActivityTypeId: id}});
        if (boatsCount && boatsCount > 0)
            return res.status(404).json(new Response({errorCode: '#USED_DATA_ERROR'}, true));
        await boatActivityType.destroy();
        res.status(200).json(new Response({message: 'Boat activity type deleted successfully'}));
    } catch (error) {
        console.error('Error deleting boat activity type:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});


router.get('/get', async (req, res) => {
    const id = req.query.id;

    try {
        // Find the boatActivityType by ID
        const boatActivityType = await BoatActivityType.findByPk(id);

        if (!boatActivityType) {
            return res.status(404).json(new Response({error: 'BoatActivityType not found'}, true));
        }
        res.status(200).json(new Response(boatActivityType));
    } catch (error) {
        console.error('Error retrieving boatActivityType:', error);
        res.status(500).json(new Response({error: 'Internal Server Error'}, true));
    }
});

module.exports = router;
