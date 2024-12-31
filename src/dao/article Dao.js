const {sequelize, Article} = require('../models');

module.exports = {
    list: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const articles = await Article.findAll({
                where: criteria.where,
                order: criteria.sort
            });
            return articles;
        } catch (error) {
            console.error('Error retrieving articles :', error);
            return error;
        }
    },
    count: async function (criteria) {
        try {
            // console.log("=====================>criteria 1 : " + JSON.stringify(criteria));
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const count = await Article.count({where: criteria.where});
            return count;
        } catch (error) {
            console.error('Error counting articles :', error);
            return error;
        }
    },
    find: async function (criteria) {
        try {
            criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
            const articles = await Article.findAll({
                where: criteria.where,
                limit: criteria.limit,
                offset: criteria.skip,
                order: criteria.sort
            });
            return articles;
        } catch (error) {
            console.error('Error retrieving articles :', error);
            return error;
        }
    },
    get: async function (id) {
        try {
            const article = await Article.findByPk(id);
            return article;
        } catch (error) {
            console.error('Error retrieving articles :', error);
            return error;
        }
    },
    create: async function (article) {
        try {
            // Start a transaction
            const transaction = await sequelize.transaction();
            try {
                // Create a article
                const createdArticle = await Article.create(article, {transaction});
                // Commit the transaction
                await transaction.commit();
                return createdArticle;
            } catch (error) {
                // Rollback the transaction in case of an error
                await transaction.rollback();
                throw error; // Rethrow the error to be caught by the outer catch block
            }
        } catch (error) {
            console.error('Error creating article :', error);
            return error;
        }
    },
    update: async function (article) {
        // Find the article by ID
        const oldArticle = await Article.findByPk(article.id);
        if (!oldArticle) {
            console.error('article not found error');
            return null;
        }
        try {
            _.assign(oldArticle, article);
            // oldArticle.name = article.name;
            await oldArticle.save();
            return oldArticle;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }

    },
    remove: async function (id) {
        // Find the commission by ID
        const oldArticles = await Article.findByPk(id);
        if (!oldArticles) {
            const error = new Error('article not found error');
            console.error(error.message);
            throw error;
        }
        try {
            await oldArticles.destroy();
            return;
        } catch (error) {
            throw error; // Rethrow the error to be caught by the outer catch block
        }
    },
}


