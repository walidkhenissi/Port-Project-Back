const {DataTypes} = require('sequelize');
const {Shipowner, Merchant} = require("./index");
module.exports = (sequelize) => {
    const Balance = sequelize.define('balance', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        credit: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        debit: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        producerCommission: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        merchantCommission: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        balance: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            default: 0,
            allowNull: false
        },
        merchantId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Merchant,
            referencesKey: 'id'
        },
        shipOwnerId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Shipowner,
            referencesKey: 'id'
        }
    });
    return Balance;
};
