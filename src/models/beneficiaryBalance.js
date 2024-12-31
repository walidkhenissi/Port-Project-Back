const {DataTypes} = require('sequelize');
const {Shipowner, Merchant, Beneficiary} = require("./index");
module.exports = (sequelize) => {
    const BeneficiaryBalance = sequelize.define('beneficiaryBalance', {
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
        beneficiaryId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Beneficiary,
            referencesKey: 'id'
        }
    });
    return BeneficiaryBalance;
};
