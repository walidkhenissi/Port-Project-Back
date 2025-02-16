const {sequelize} = require("../models");
var router = require('express').Router();
var Response = require('../utils/response');
moment.locale('fr');


router.post('/find', async function (req, res) {
    try {
        let criteria = req.body.criteria;
        criteria = sequelizeAdapter.checkSequelizeConstraints(criteria);
        const entity = req.body.entity;
        // console.log("=====================>criteria : " + JSON.stringify(criteria));
        // console.log("=====================>entity : " + JSON.stringify(entity));
        const {count, rows: result} = await sequelize.modelManager.getModel(entity).findAndCountAll({
            where: criteria.where,
            limit: criteria.limit,
            offset: criteria.skip,
            order: criteria.sort
        });
        const response = new Response();
        response.data=result;
        response.metaData.count= count;
        // console.log("=====================>response : " + JSON.stringify(response));
        res.status(200).json(response);
    } catch (error) {
        console.error('Generic find error :', error);
        res.status(500).json(new Response(error,true));
    }

});

router.delete('/remove', async function (req, res, next) {
    sequelize.modelManager.getModel(req.body.entity).destroy({id: req.query.id}).exec(function (err, removed) {
        try {
            if (err)
                return next(err);
            res.status(200).json(new Response(removed));
        } catch (err) {
            next(err);
        }
    });
});

module.exports = router;
