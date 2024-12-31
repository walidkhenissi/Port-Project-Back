const {DataTypes} = require('sequelize');

module.exports = (sequelize) => {
    const Commission = sequelize.define('commission', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        }
    });
    return Commission;
};
