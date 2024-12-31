module.exports = function(data, isError){
    if(isError === true)
        this.error = data;
    else{
        this.data = data;
        this.metaData = {};
    }
};
