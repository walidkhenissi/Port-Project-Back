const {sequelize, Boat, Shipowner, BoatActivityType} = require('../models');
const Response = require("../utils/response");

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const boats = await Boat.findAll({
                where: criteria.where,
                include: [{model: Shipowner, as: 'shipowner'}, {model: BoatActivityType, as: 'boatActivityType'}],
                order: criteria.sort
            });
            return boats;
        } catch (error) {
            console.error('Error retrieving boats :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Boat.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting boats :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const boats = await Boat.findAll({
                where: criteria.where,
                include: [{model: Shipowner, as: 'shipowner'}, {model: BoatActivityType, as: 'boatActivityType'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return boats;
        } catch (error) {
            console.error('Error retrieving boats :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const boat = await Boat.findByPk(id, {
                include: [{model: Shipowner, as: 'shipowner'}, {model: BoatActivityType, as: 'boatActivityType'}]
            });
            return boat;
        } catch (error) {
            console.error('Error retrieving boat :', error);
            return error;
        }
    },
    create: async function (boat) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                let activityTypeId;
                if (!tools.isFalsey(boat.boatActivityType) && !tools.isFalsey(boat.boatActivityType.id))
                    activityTypeId = boat.boatActivityType.id;
                if (!activityTypeId && boat.boatActivityTypeId)
                    activityTypeId = boat.boatActivityTypeId;
                if (activityTypeId) {
                    const activityType = await BoatActivityType.findByPk(activityTypeId);
                    if (!activityType) {
                        return null;
                    }
                    boat.boatActivityTypeId = activityType.id;
                } else
                    return null;
                // Create a boat
                const createdBoat = await Boat.create(boat, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdBoat;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating boat :', error);
            return error;
        }
    },
    update: async function (boat) {
        // Find the boat by ID
        const oldBoat = await Boat.findByPk(boat.id);
        if (!oldBoat) {
            console.error('boat not found error');
            return null;
        }
        try {
            oldBoat.name = boat.name;
            oldBoat.serialNumber = boat.serialNumber;
            let activityTypeId;
            if (!tools.isFalsey(boat.boatActivityType) && !tools.isFalsey(boat.boatActivityType.id))
                activityTypeId = boat.boatActivityType.id;
            if (!activityTypeId && boat.boatActivityTypeId)
                activityTypeId = boat.boatActivityTypeId;
            if (activityTypeId) {
                const activityType = await BoatActivityType.findByPk(activityTypeId);
                if (!activityType) {
                    return null;
                }
                oldBoat.boatActivityTypeId = activityType.id;
            } else
                return null;
            await oldBoat.save();
            return oldBoat;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the boat by ID
        const oldBoat = await Boat.findByPk(id);
        if (!oldBoat) {
            const error = new Error('boat not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldBoat.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}


