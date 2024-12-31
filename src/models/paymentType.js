const {DataTypes} = require('sequelize');

module.exports = (sequelize) => {
    const PaymentType = sequelize.define('paymentType', {
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
        },
        merchantPayment: {
            type: DataTypes.BOOLEAN,
            allowNull: false
        },
        shipOwnerPayment: {
            type: DataTypes.BOOLEAN,
            allowNull: false
        },
        commissionnaryPayment: {
            type: DataTypes.BOOLEAN,
            allowNull: false
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    });
    return PaymentType;
};
