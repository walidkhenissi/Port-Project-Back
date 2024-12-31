const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const BoatActivityType = sequelize.define('BoatActivityType', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        }
    });
    return BoatActivityType;
};
