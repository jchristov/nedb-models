const
    augmenter = require('./helpers/augmenter'),
    converter = require('./helpers/converter'),
    datastore = require('./helpers/datastore'),
    Extension = require('./Extension')

/**
 * @class
 */
class Model {
    constructor(values) {
        this.assign(values)
    }

    /**
     * Assign values to the model.
     *
     * @example
     * let book = await Book.findOne()
     * // Book { _id: 'XXX', title: '...' }
     * book.assign({ title: ',,,', one: 1 })
     * // now book is Book { _id: 'XXX', title: ',,,', one: 1 }
     * 
     * @param  {Object} values Key-value pairs to be assigned.
     * @return {undefined}
     */
    assign(values) {
        values = (
            'object' === typeof values
            && null !== values
        ) ? values : {}

        Object.keys(values).forEach(key => {
            this[key] = values[key]
        })
    }

    /**
     * Get the datastore configuration of the model.
     * For more information visit:
     * https://github.com/louischatriot/nedb#creatingloading-a-database
     *
     * @example
     * return {
     *     inMemoryOnly: true,
     *     timestampData: true
     * }
     * 
     * @return {null|string|Object} The datastore configuration.
     * @static
     */
    static datastore() {
        return null
    }

    /**
     * Get the defaults of the model.
     *
     * **Note**:
     * 
     * The returned object **has** to contain at least
     * three objects:
     * - `query` - used in `Model.find`, `Model.findOne` and `Model.count`
     * - `projection` - used in `Model.find` and `Model.findOne`
     * - `values` - used in `Model.insert`
     *
     * It's good practice **not** to return a
     * completely new value, but to return an
     * extended one based on the parent's defaults.
     *
     * @example
     * return extend(true, super.defaults(), { ... })
     * 
     * @return {Object}
     */
    static defaults() {
        return {
            query: {},
            projection: {},
            values: {}
        }
    }

    /**
     * Get the class in the instance.
     * 
     * @return {Function}
     */
    getClass() {
        return this.constructor
    }

    /**
     * Get a plain object representation of the model.
     * 
     * @return {Object}
     */
    toPOJO() {
        return Object.keys(this).reduce((values, key) => {
            values[key] = this[key]
            return values
        }, {})
    }

    /**
     * Get a JSON string representation of the model.
     * 
     * @return {string}
     */
    toJSON(replacer, space) {
        return JSON.stringify(
            this.toPOJO(),
            replacer,
            space
        )
    }

    /**
     * Save the model to the database.
     *
     * @example
     * let book = new Book()
     * book.title = '...'
     * // now book is Book { title: '...' }
     * await book.save()
     * // now book is Book { _id: 'XXX', title: '...'}
     * 
     * @return {Promise.<this>}
     * @async
     */
    async save() {
        let
            result = this._id
                ? await this.getClass().update(
                    { _id: this._id },
                    { $set: this.toPOJO() },
                    { returnUpdatedDocs: true }
                )
                : await this.getClass().insert(
                    this.toPOJO()
                )

        this.assign(
            Array.isArray(result)
                ? result[0]
                : result
        )

        return this
    }

    /**
     * Remove the model from the database.
     *
     * @example
     * let book = await Book.findOne()
     * await book.remove()
     * // now book is not persisted in the database
     * 
     * @return {Promise.<number>}
     * @async
     */
    async remove() {
        if ( ! this._id) return 0
        return await this.getClass().remove(
            { _id: this._id },
            { multi: false }
        )
    }

    /**
     * Create a duplicate of the model (in database).
     *
     * @example
     * let book = await Book.findOne()
     * // Book { _id: 'XXX', title: '...' }
     * let duplicate = await book.duplicate()
     * // Book { _id: 'YYY', title: '...' }
     * 
     * @return {Promise.<static>} The duplicate...
     * @async
     */
    async duplicate() {
        let values = this.toPOJO()
        delete values._id
        return this.getClass().insert(values)
    }

    /**
     * Find models that match a query.
     * https://github.com/louischatriot/nedb#finding-documents
     *
     * **Note**: This is the only method of the Model class
     * that is not an `async function`.
     * That is because of the way the Cursor works.
     * The cool thing about Cursors is that you can `await` their results.
     *
     * @example
     * return await Book.find({ ... }).sort({ ... })
     * 
     * @example
     * // to get all books
     * return await Book.find()
     *
     * @param {Object} query 
     * @param {Object} projection
     * @return {Cursor} https://github.com/bajankristof/nedb-promises#find-query--projection--
     * @static
     */
    static find(query = {}, projection) {
        query = augmenter(this.defaults().query)(query)
        projection = augmenter(this.defaults().projection)(projection)

        let cursor = datastore(this)().find(query, projection),
            exec = cursor.exec

        cursor.exec = async () => {
            return converter(this)(
                await exec.call(cursor)
            )
        }

        return cursor
    }

    /**
     * Find one model that matches a query.
     * https://github.com/louischatriot/nedb#finding-documents
     *
     * @param {Object} query
     * @param {Object} projection
     * @return {Promise.<static>}
     * @static
     * @async
     */
    static async findOne(query = {}, projection) {
        query = augmenter(this.defaults().query)(query)
        projection = augmenter(this.defaults().projection)(projection)

        return converter(this)(
            await datastore(this)().findOne(query, projection)
        )
    }

    /**
     * Count models that match a query.
     * https://github.com/louischatriot/nedb#counting-documents
     *
     * @param {Object} query
     * @return {Promise.<number>}
     * @static
     * @async
     */
    static async count(query = {}) {
        query = augmenter(this.defaults().query)(query)

        return converter(this)(
            await datastore(this)().count(query)
        )
    }

    /**
     * Insert a document or bulk insert documents.
     * Returns the inserted documents in model format.
     * https://github.com/louischatriot/nedb#inserting-documents
     *
     * @example
     * await Book.insert({ title: '...' })
     * // Book { _id: 'XXX', title: '...' }
     *
     * @example
     * await Book.insert([ { title: '...' }, { title: ',,,' } ])
     * // [ Book { _id: 'XXX', title: '...' }, Book { _id: 'YYY', title: ',,,' } ]
     *
     * @param {Object|Object[]} values
     * @return {Promise.<static|static[]>}
     * @static
     * @async
     */
    static async insert(values) {
        let augment = augmenter(this.defaults().values)

        values = Array.isArray(values)
            ? values.map(augment)
            : augment(values)

        return converter(this)(
            await datastore(this)().insert(values)
        )
    }

    /**
     * Update models that match a query.
     * https://github.com/louischatriot/nedb#updating-documents
     * By default it returns the number of updated documents.
     * 
     * You can set options.returnUpdatedDocs to true to get the updated
     * documents as models.
     *
     * @example
     * await Book.update({ ... }, { $set: { ... } })
     * // 1
     *
     * @param {Object} query
     * @param {Object} values
     * @param {Object} options
     * @return {Promise.<*>}
     * @static
     * @async
     */
    static async update(query = {}, values, options) {
        options = augmenter({ multi: true })(options)

        return converter(this)(
            await datastore(this)().update(query, values, options)
        )
    }

    /**
     * Remove models that match a query.
     * https://github.com/louischatriot/nedb#removing-documents
     * By default removing multiple documents is enabled.
     * Set options.multi to false to disable it.
     *
     * @example
     * await Book.remove({ ... })
     * // 5
     *
     * @param {Object} query
     * @param {Object} options
     * @return {Promise.<number>}
     * @static
     * @async
     */
    static async remove(query = {}, options) {
        options = augmenter({ multi: true })(options)

        return converter(this)(
            await datastore(this)().remove(query, options)
        )
    }

    /**
     * Create a model and save it to the database.
     * (An alias to insert...)
     * 
     * @param  {Object|Object[]} values
     * @return {Promise.<static|static[]>}
     * @static
     * @async
     */
    static async create(values) {
        return await this.insert(values)
    }

    /**
     * Use an extension on the model.
     *
     * @example
     * Book.use(SoftRemoves)
     * 
     * @param  {Function|Function[]} extension Extension constructor(s).
     * @return {boolean} true if all extensions were applied successfully.
     * @static
     */
    static use(extension) {
        if (Array.isArray(extension)) {
            return extension.reduce((result, extension) => {
                return result && this.use(extension)
            }, true)
        }

        if ('function' === typeof extension) {
            extension = new extension(this)
        } else {
            return false
        }

        if ( ! extension instanceof Extension) {
            return false
        }

        return extension.apply()
    }
}

module.exports = Model
