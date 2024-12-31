const {DataTypes} = require('sequelize');
const {Commission} = require("./index");

module.exports = (sequelize) => {
    const CommissionHistory = sequelize.define('commissionHistory', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        commissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: Commission,
            referencesKey: 'id'
        },
        value: {
            type: DataTypes.DOUBLE,
            length: 9,
            precision: 6,
            allowNull: false
        },
        isSellerCommission: {
            type: DataTypes.BOOLEAN,
            default: 0
        },
        isCustomerCommission: {
            type: DataTypes.BOOLEAN,
            default: 0
        },
        isPercentValue: {
            type: DataTypes.BOOLEAN,
            default: 1
        },
        isPerUnitValue: {
            type: DataTypes.BOOLEAN,
            default: 0
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        }
    });
    return CommissionHistory;
};
