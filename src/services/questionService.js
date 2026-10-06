import Question from '../models/Question.js';
import Answer from '../models/Answer.js';
import Tag from '../models/Tag.js';
import User from '../models/User.js';
import { handleVote } from './voteService.js';
import { createAppError } from '../utils/createAppError.js';

const resolveTagIds = async (tags) => {
    const tagNames = [...new Set(
        (tags ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
    )];

    const tagDocuments = await Promise.all(
        tagNames.map((name) => Tag.findOneAndUpdate(
            { name },
            { $setOnInsert: { name } },
            { new: true, upsert: true }
        ))
    );

    return tagDocuments.map((tag) => tag._id);
};

export const createQuestionService = async (title, description, tags, author) => {
    return Question.create({
        title,
        description,
        tags: await resolveTagIds(tags),
        author,
    });
};

export const updateQuestionService = async (questionId, title, description, tags, loggedInUser) => {
    const question = await Question.findById(questionId);
    if (!question) {
        throw createAppError('Question not found', 404);
    }

    console.log("question.author = ", question.author);

    const isOwner = String(question.author) === String(loggedInUser?.id);
    if (!isOwner && !loggedInUser?.isAdmin) {
        throw createAppError('Not authorized to update this question', 403);
    }

    question.title = title;
    question.description = description;
    question.tags = await resolveTagIds(tags);

    return question.save();
};

export const deleteQuestionService = async (id, loggedInUser) => {
    const question = await Question.findById(id);
    if (!question) {
        throw createAppError('Question not found', 404);
    }

    const isOwner = String(question.author) === String(loggedInUser?.id);
    if (!isOwner && !loggedInUser?.isAdmin) {
        throw createAppError('Not authorized to delete this question', 403);
    }

    await Answer.deleteMany({ questionId: question._id });
    await Question.deleteOne({ _id: question._id });

    return question;
};

export const upvoteQuestionService = async (questionId, userId) => {
    const updatedQuestion = await handleVote(Question, questionId, userId, 'upvote');
    if (!updatedQuestion) {
        throw createAppError('Unable to upvote question', 400);
    }

    return updatedQuestion;
};

export const downvoteQuestionService = async (questionId, userId) => {
    const updatedQuestion = await handleVote(Question, questionId, userId, 'downvote');
    if (!updatedQuestion) {
        throw createAppError('Unable to downvote question', 400);
    }

    return updatedQuestion;
};

export const getAllQuestionsService = async () => {
    const questions = await Question.find()
      .populate({ path: 'author', select: 'name -_id' })
      .populate({ path: 'tags', select: 'name -_id' })
      .sort({ createdAt: -1 });
    if (!questions || questions.length === 0) {
        throw createAppError('No questions found', 404);
    }

    const questionsWithCount = await Promise.all(
        questions.map(async (q) => {
            const answerCount = await Answer.countDocuments({ questionId: q._id });
            return { ...(q.toObject?.() ?? q), answerCount };
        })
    );

    return questionsWithCount;
};

export const getQuestionByIdService = async (questionId) => {
    const question = await Question.findByIdAndUpdate(
        questionId,
        { $inc: { views: 1 } },
        { new: true }
    )
        .populate({ path: 'author', select: 'name -_id' })
        .populate({ path: 'tags', select: 'name -_id' });
    if (!question) {
        throw createAppError('No question found', 404);
    }

    const answers = await Answer.find({ questionId: question._id });
    return { question: (question.toObject?.() ?? question), answers };
};

// export const getAllQuestionsService = async () => {

//     const questions = await Question.aggregate([
//       // 1. Populate the author (Join with 'users' collection)
//       {
//         $lookup: {
//           from: 'users',
//           localField: 'author',
//           foreignField: '_id',
//           as: 'authorDetails'
//         }
//       },
//       // 2. Convert author from an array of 1 item back to a single object
//       { 
//         $unwind: {
//           path: '$authorDetails',
//           preserveNullAndEmptyArrays: true // Keeps the question even if the author was deleted
//         }
//       },
//       // 3. Populate the tags (Join with 'tags' collection)
//       {
//         $lookup: {
//           from: 'tags',
//           localField: 'tags',
//           foreignField: '_id',
//           as: 'tagDetails'
//         }
//       },
//       // 4. Look up answers belonging to this question (Join with 'answers' collection)
//       {
//         $lookup: {
//           from: 'answers',
//           localField: '_id',
//           foreignField: 'questionId', // The field in Answer schema referencing Question
//           as: 'answers'
//         }
//       },
//       // 5. Attach the answer count
//       {
//         $addFields: {
//           answerCount: { $size: '$answers' }
//         }
//       },
//       // 6. Project fields to remove the full answers array
//       {
//         $project: {
//             title: 1,
//             description: 1,
//             author: '$authorDetails.name',
//             tags: '$tagDetails.name',
//             answerCount: 1
//         }
//       }
//     ]);

//     // Add error handling if no questions found
//     if (!questions || questions.length === 0) {
//       throw createAppError('No questions found', 404);
//     }

//     return questions;
// };