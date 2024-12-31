const {DataTypes} = require('sequelize');
const {CashAccount} = require("./index");

module.exports = (sequelize) => {
    const CashAccount = sequelize.define('cashAccount', {
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
        parentId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            // references: CashAccount,
            referencesKey: 'id'
        },
        key: {
            type: DataTypes.STRING,
            allowNull: true
        },
        userTransaction: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            default: false
        }
    });

    return CashAccount;
};
