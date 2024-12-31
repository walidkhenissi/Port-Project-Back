const {Shipowner, sequelize, Civility, Address, Boat} = require("../models");
const Response = require("../utils/response");
module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const shipowners = await Shipowner.findAll({
                where: criteria.where,
                include: [{model: Address, as: 'address'},
                    {model: Civility, as: 'civility'},
                    {model: Boat, as: 'boats'}
                ],
                order: criteria.sort
            });
            return shipowners;
        } catch (error) {
            console.error('Error retrieving shipowners :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Shipowner.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting shipowners :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            // console.log("=====================>criteria : " + JSON.stringify(criteria));
            const shipowners = await Shipowner.findAll({
                where: criteria.where,
                include: [{model: Address, as: 'address'},
                    {model: Civility, as: 'civility'},
                    {model: Boat, as: 'boats'}],
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return shipowners;
        } catch (error) {
            console.error('Error retrieving shipowners :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const shipowner = await Shipowner.findByPk(id, {
                include: [{model: Address, as: 'address'},
                    {model: Civility, as: 'civility'},
                    {model: Boat, as: 'boats'}]
            });
            return shipowner;
        } catch (error) {
            console.error('Error retrieving shipowner :', error);
            return error;
        }
    },
    create: async function (shipOwner) {
        try {
            const transaction = await sequelize.transaction();
            shipOwner.civilityId = shipOwner.civility ? shipOwner.civility.id : undefined;
            shipOwner.name=shipOwner.firstName + ' ' + shipOwner.lastName;
            try {
                if (shipOwner.address && (shipOwner.address.street || shipOwner.address.city || shipOwner.address.postalCode)) {
                    // Create an address
                    const newAddress = await Address.create(shipOwner.address, {transaction});
                    shipOwner.addressId = newAddress.id;
                }
                const newShipOwner = await Shipowner.create(shipOwner, {transaction});
                await transaction.commit();
                return newShipOwner;
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            console.error('Error creating shipOwner :', error);
            return error;
        }
    },
    update: async function (toUpdateObject) {
        const id = toUpdateObject.id;
        // console.log("=====================>toUpdateObject : " + JSON.stringify(toUpdateObject));

        try {
            const shipowner = await Shipowner.findByPk(id, {
                include: [{model: Address, as: 'address'},
                    {model: Civility, as: 'civility'},
                    {model: Boat, as: 'boats'}]
            });
            if (!shipowner) {
                console.error('shipowner not found error');
                return null;
            }

            shipowner.firstName = toUpdateObject.firstName || shipowner.firstName;
            shipowner.lastName = toUpdateObject.lastName || shipowner.lastName;
            shipowner.name=shipowner.firstName + ' ' + shipowner.lastName;
            shipowner.civilityId = toUpdateObject.civility.id || shipowner.civility.id;
            shipowner.socialReason = toUpdateObject.socialReason || shipowner.socialReason;
            shipowner.taxRegistrationNumber = toUpdateObject.taxRegistrationNumber || shipowner.taxRegistrationNumber;
            shipowner.phoneNumber = toUpdateObject.phoneNumber || shipowner.phoneNumber;
            shipowner.enabled = tools.isFalsey(toUpdateObject.enabled) ? shipowner.enabled : toUpdateObject.enabled;
            shipowner.civility = toUpdateObject.civility || shipowner.civility;
            if (toUpdateObject.address) {
                if (!shipowner.address) {
                    const newAddress = await Address.create(toUpdateObject.address);
                    shipowner.addressId = newAddress.id;
                } else {
                    shipowner.address.street = toUpdateObject.address.street || shipowner.address.street;
                    shipowner.address.city = toUpdateObject.address.city || shipowner.address.city;
                    shipowner.address.postalCode = toUpdateObject.address.postalCode || shipowner.address.postalCode;
                    await shipowner.address.save();
                }
            }
            await shipowner.save();
            return shipowner;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        try {
            const shipowner = await Shipowner.findByPk(id);
            if (!shipowner) {
                const error = new Error('Shipowner not found error');
                console.error(error.message);
                throw error;
            }
            if (shipowner.addressId) {
                await Address.destroy({where: {id: shipowner.addressId}});
            }
            await shipowner.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    }
}
