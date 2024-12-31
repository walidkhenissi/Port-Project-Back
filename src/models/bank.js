const {DataTypes} = require('sequelize');

module.exports = (sequelize) => {
    const Bank = sequelize.define('bank', {
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
    return Bank;
};
