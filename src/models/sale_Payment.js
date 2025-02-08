const {DataTypes} = require('sequelize');
const {PaymentType, Payment, Sale} = require("./index");

module.exports = (sequelize) => {
    const SalePayment = sequelize.define('sale_Payment', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        date: {
            type: DataTypes.DATE,
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
        saleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: Sale,
            referencesKey: 'id'
        }
    });
    return SalePayment;
};
