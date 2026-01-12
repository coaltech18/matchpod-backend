import mongoose from 'mongoose';

export const pointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true,
    default: 'Point',
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true,
    validate: {
      validator: function(v: number[]) {
        return v.length === 2 &&
          v[0] >= -180 && v[0] <= 180 && // longitude
          v[1] >= -90 && v[1] <= 90;     // latitude
      },
      message: 'Invalid coordinates. Must be [longitude, latitude] within valid ranges.',
    },
  },
}, {
  _id: false, // Prevent MongoDB from creating an _id for subdocuments
});
