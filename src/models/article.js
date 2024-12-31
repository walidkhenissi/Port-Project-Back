const {DataTypes} = require('sequelize');
module.exports = (sequelize) => {
    const Article = sequelize.define('article', {
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
    return Article;
};
