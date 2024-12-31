const {DataTypes} = require('sequelize');
const {Commission} = require("./index");
const {Beneficiary} = require("./index");
module.exports = (sequelize) => {
    const CommissionBeneficiary = sequelize.define('commissionBeneficiary', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        commissionId: {
            type: DataTypes.INTEGER,
            references: Commission,
            referencesKey: 'id',
            allowNull: false
        },
        beneficiaryId: {
            type: DataTypes.INTEGER,
            references: Beneficiary,
            referencesKey: 'id',
            allowNull: false
        }
    });
    return CommissionBeneficiary;
};
