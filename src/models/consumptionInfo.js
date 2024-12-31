const {DataTypes} = require('sequelize');

module.exports = (sequelize) => {
    const ConsumptionInfo = sequelize.define('consumptionInfo', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        reference: {
            type: DataTypes.STRING,
            allowNull: false
        }
    });
    return ConsumptionInfo;
};
