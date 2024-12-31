const {DataTypes} = require('sequelize');
module.exports = (sequelize) => {
    const Beneficiary = sequelize.define('beneficiary', {
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
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    });
    return Beneficiary;
};
