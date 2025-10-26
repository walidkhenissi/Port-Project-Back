const {DataTypes} = require('sequelize');
module.exports = (sequelize) => {
    const BoxesType = sequelize.define('boxesType', {
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
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        default: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            default: false
        }
    });
    return BoxesType;
};
