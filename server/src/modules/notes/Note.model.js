import mongoose from 'mongoose';

const ratingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    value: { type: Number, min: 1, max: 5, required: true },
  },
  { _id: false },
);

const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [140, 'Title cannot exceed 140 characters'],
    },
    description: { type: String, trim: true, default: '', maxlength: 2000 },

    subject: { type: String, required: [true, 'Subject is required'], trim: true, index: true, maxlength: 80 },
    course: { type: String, trim: true, default: '', index: true },
    branch: { type: String, trim: true, default: '' },
    semester: { type: Number, min: 1, max: 10, default: null, index: true },
    year: { type: Number, min: 1, max: 6, default: null },

    file: {
      url: { type: String, required: true },
      publicId: { type: String, default: '' },
      name: { type: String, default: '' },
      mimetype: { type: String, default: '' },
      size: { type: Number, default: 0 },
    },
    previewImages: [{ type: String }],

    tags: [{ type: String, trim: true, maxlength: 30, lowercase: true }],

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },

    downloadCount: { type: Number, default: 0, min: 0 },
    ratings: { type: [ratingSchema], default: [] },
    averageRating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

noteSchema.index({ title: 'text', description: 'text', subject: 'text' });
noteSchema.index({ subject: 1, course: 1, semester: 1 });
noteSchema.index({ downloadCount: -1 });

export const Note = mongoose.model('Note', noteSchema);
