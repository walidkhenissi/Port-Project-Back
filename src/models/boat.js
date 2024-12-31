const {DataTypes} = require('sequelize');
const BoatActivityTypeModel = require('./boat.activity.type');

module.exports = (sequelize) => {
    const BoatActivityType = BoatActivityTypeModel(sequelize);
    const Boat = sequelize.define('Boat', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        serialNumber: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        boatActivityTypeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        shipOwnerId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        }
    });
    Boat.belongsTo(BoatActivityType, {foreignKey: 'boatActivityTypeId', targetKey: 'id', as: 'boatActivityType'});
    return Boat;
};

