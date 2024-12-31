const {DataTypes} = require('sequelize');
const {PaymentType, Payment, SalesTransaction} = require("./index");

module.exports = (sequelize) => {
    const SalesTransactionPayment = sequelize.define('salesTransaction_Payment', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        value: {
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
        paymentId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: Payment,
            referencesKey: 'id'
        },
        salesTransactionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: SalesTransaction,
            referencesKey: 'id'
        }
    });
    return SalesTransactionPayment;
};
