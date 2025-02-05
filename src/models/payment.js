const {DataTypes} = require('sequelize');
const {Merchant, PaymentType, Bank, ConsumptionInfo} = require("./index");

module.exports = (sequelize) => {
    const Payment = sequelize.define('payment', {
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
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        merchantId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Merchant,
            referencesKey: 'id'
        },
        isCommissionnaryPayment: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            default: false
        },
        value: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        consumed: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        rest: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 3,
            allowNull: false,
            default: 0
        },
        paymentTypeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: PaymentType,
            referencesKey: 'id'
        },
        consumptionInfoId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: ConsumptionInfo,
            referencesKey: 'id'
        },
        number: {
            type: DataTypes.STRING,
            allowNull: true
        },
        bankId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: Bank,
            referencesKey: 'id'
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        signatory: {
            type: DataTypes.STRING,
            allowNull: true
        },
        isStartBalance: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            default: false
        },
        note: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    });
    return Payment;
};
