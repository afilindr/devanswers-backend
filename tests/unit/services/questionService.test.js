import '../../../tests/setup.js';

import { beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Answer from '../../../src/models/Answer.js';
import Question from '../../../src/models/Question.js';
import Tag from '../../../src/models/Tag.js';
import User from '../../../src/models/User.js';
import {
    createQuestionService,
    deleteQuestionService,
    downvoteQuestionService,
    getAllQuestionsService,
    getQuestionByIdService,
    updateQuestionService,
    upvoteQuestionService,
} from '../../../src/services/questionService.js';

const createUser = async (overrides = {}) => User.create({
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `${new mongoose.Types.ObjectId()}@example.com`,
    password: 'password',
    isAdmin: overrides.isAdmin ?? false,
});

const createQuestion = async (author, overrides = {}) => Question.create({
    title: overrides.title ?? 'Original title',
    description: overrides.description ?? 'Original description',
    tags: overrides.tags ?? [],
    author: author._id,
});

describe('questionService', () => {
    beforeEach(async () => {
        await Promise.all([
            Answer.deleteMany({}),
            Question.deleteMany({}),
            Tag.deleteMany({}),
            User.deleteMany({}),
        ]);
    });

    it('creates a question and upserts unique comma-separated tags', async () => {
        const author = await createUser();
        const question = await createQuestionService(
            'How do tags work?',
            'A question about tags',
            ' javascript, mongodb, javascript, , ',
            author._id,
        );

        expect(question).toMatchObject({
            title: 'How do tags work?',
            description: 'A question about tags',
            author: author._id,
        });
        expect(await Tag.countDocuments()).toBe(2);
        expect(await Question.countDocuments()).toBe(1);
    });

    it('creates a question with no tags when tags are omitted', async () => {
        const author = await createUser();
        const question = await createQuestionService('Title', 'Description', undefined, author._id);

        expect(question.tags).toHaveLength(0);
    });

    it('rejects a question that is missing its required title', async () => {
        const author = await createUser();

        await expect(createQuestionService(undefined, 'Description', '', author._id))
            .rejects.toMatchObject({ name: 'ValidationError' });
        expect(await Question.countDocuments()).toBe(0);
    });

    it('lists questions with populated author and tags and answer counts', async () => {
        const author = await createUser({ name: 'Ada' });
        const tag = await Tag.create({ name: 'javascript' });
        const question = await createQuestion(author, { tags: [tag._id] });
        await Answer.create({ questionId: question._id, answerText: 'First answer', author: author._id });
        await Answer.create({ questionId: question._id, answerText: 'Second answer', author: author._id });

        const questions = await getAllQuestionsService();

        expect(questions).toHaveLength(1);
        expect(questions[0]).toMatchObject({
            author: { name: 'Ada' },
            tags: [{ name: 'javascript' }],
            answerCount: 2,
        });
    });

    it('rejects an empty question list', async () => {
        await expect(getAllQuestionsService()).rejects.toMatchObject({
            message: 'No questions found',
            statusCode: 404,
        });
    });

    it('returns multiple questions in newest-first order', async () => {
        const author = await createUser();
        const older = await createQuestion(author, { title: 'Older' });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const newer = await createQuestion(author, { title: 'Newer' });

        const questions = await getAllQuestionsService();

        expect(questions.map(({ _id }) => String(_id))).toEqual([
            String(newer._id),
            String(older._id),
        ]);
    });

    it('increments views and returns all answers for a question', async () => {
        const author = await createUser();
        const question = await createQuestion(author);
        const answer = await Answer.create({
            questionId: question._id,
            answerText: 'Useful answer',
            author: author._id,
        });

        const firstResult = await getQuestionByIdService(question._id);
        const secondResult = await getQuestionByIdService(question._id);

        expect(firstResult.question.views).toBe(1);
        expect(secondResult.question.views).toBe(2);
        expect(firstResult.answers).toHaveLength(1);
        expect(firstResult.answers[0]._id).toEqual(answer._id);
    });

    it('returns an empty answer array when a question has no answers', async () => {
        const question = await createQuestion(await createUser());

        const result = await getQuestionByIdService(question._id);

        expect(result.answers).toEqual([]);
    });

    it('rejects a missing question detail', async () => {
        await expect(getQuestionByIdService(new mongoose.Types.ObjectId())).rejects.toMatchObject({
            message: 'No question found',
            statusCode: 404,
        });
    });

    it('allows the owner to update a question and replaces its tags', async () => {
        const author = await createUser();
        const question = await createQuestion(author);

        const updated = await updateQuestionService(
            question._id,
            'Updated title',
            'Updated description',
            'node, express, node',
            { id: author._id, isAdmin: false },
        );

        expect(updated).toMatchObject({ title: 'Updated title', description: 'Updated description' });
        expect(await Tag.countDocuments()).toBe(2);
    });

    it('allows an admin to update another user question', async () => {
        const author = await createUser();
        const admin = await createUser({ isAdmin: true });
        const question = await createQuestion(author);

        await expect(updateQuestionService(
            question._id,
            'Admin title',
            'Admin description',
            '',
            { id: admin._id, isAdmin: true },
        )).resolves.toMatchObject({ title: 'Admin title' });
    });

    it('rejects update for a missing or unauthorized question', async () => {
        const author = await createUser();
        const otherUser = await createUser();
        const question = await createQuestion(author);

        await expect(updateQuestionService(
            new mongoose.Types.ObjectId(), 'Nope', 'Nope', '', { id: author._id, isAdmin: false },
        )).rejects.toMatchObject({ message: 'Question not found', statusCode: 404 });
        await expect(updateQuestionService(
            question._id, 'Nope', 'Nope', '', { id: otherUser._id, isAdmin: false },
        )).rejects.toMatchObject({ message: 'Not authorized to update this question', statusCode: 403 });
    });

    it('deletes a question and cascades its answers for the owner', async () => {
        const author = await createUser();
        const question = await createQuestion(author);
        await Answer.create({ questionId: question._id, answerText: 'Delete me', author: author._id });

        const deleted = await deleteQuestionService(question._id, { id: author._id, isAdmin: false });

        expect(deleted._id).toEqual(question._id);
        expect(await Question.exists({ _id: question._id })).toBeNull();
        expect(await Answer.countDocuments({ questionId: question._id })).toBe(0);
    });

    it('allows an admin to delete another user question', async () => {
        const author = await createUser();
        const admin = await createUser({ isAdmin: true });
        const question = await createQuestion(author);

        await expect(deleteQuestionService(question._id, { id: admin._id, isAdmin: true }))
            .resolves.toMatchObject({ _id: question._id });
    });

    it('rejects delete for a missing or unauthorized question', async () => {
        const author = await createUser();
        const otherUser = await createUser();
        const question = await createQuestion(author);

        await expect(deleteQuestionService(new mongoose.Types.ObjectId(), { id: author._id, isAdmin: false }))
            .rejects.toMatchObject({ message: 'Question not found', statusCode: 404 });
        await expect(deleteQuestionService(question._id, { id: otherUser._id, isAdmin: false }))
            .rejects.toMatchObject({ message: 'Not authorized to delete this question', statusCode: 403 });
    });

    it('upvotes, ignores a repeated upvote, and toggles to a downvote', async () => {
        const author = await createUser();
        const voter = await createUser();
        const question = await createQuestion(author);

        await upvoteQuestionService(question._id, voter._id);
        await upvoteQuestionService(question._id, voter._id);
        let saved = await Question.findById(question._id);
        expect(saved.upvotes).toHaveLength(1);
        expect(saved.downvotes).toHaveLength(0);
        expect(saved.voteCount).toBe(1);

        await downvoteQuestionService(question._id, voter._id);
        saved = await Question.findById(question._id);
        expect(saved.upvotes).toHaveLength(0);
        expect(saved.downvotes).toHaveLength(1);
        expect(saved.voteCount).toBe(-1);
    });

    it('downvotes, ignores a repeated downvote, and toggles to an upvote', async () => {
        const author = await createUser();
        const voter = await createUser();
        const question = await createQuestion(author);

        await downvoteQuestionService(question._id, voter._id);
        await downvoteQuestionService(question._id, voter._id);
        await upvoteQuestionService(question._id, voter._id);

        const saved = await Question.findById(question._id);
        expect(saved.upvotes).toHaveLength(1);
        expect(saved.downvotes).toHaveLength(0);
        expect(saved.voteCount).toBe(1);
    });

    it('returns the unchanged question for a repeated upvote', async () => {
        const author = await createUser();
        const voter = await createUser();
        const question = await createQuestion(author);

        const first = await upvoteQuestionService(question._id, voter._id);
        const repeated = await upvoteQuestionService(question._id, voter._id);

        expect(String(repeated._id)).toBe(String(first._id));
        expect(repeated.upvotes).toHaveLength(1);
        expect(repeated.voteCount).toBe(1);
    });

    it('returns the unchanged question for a repeated downvote', async () => {
        const author = await createUser();
        const voter = await createUser();
        const question = await createQuestion(author);

        const first = await downvoteQuestionService(question._id, voter._id);
        const repeated = await downvoteQuestionService(question._id, voter._id);

        expect(String(repeated._id)).toBe(String(first._id));
        expect(repeated.downvotes).toHaveLength(1);
        expect(repeated.voteCount).toBe(-1);
    });

    it('rejects an upvote for a missing question', async () => {
        await expect(upvoteQuestionService(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()))
            .rejects.toThrow('Document not found');
    });

    it('rejects a downvote for a missing question', async () => {
        await expect(downvoteQuestionService(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()))
            .rejects.toThrow('Document not found');
    });

    it('propagates the missing-document vote failure for a falsy vote target', async () => {
        await expect(upvoteQuestionService(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()))
            .rejects.toThrow('Document not found');
        await expect(downvoteQuestionService(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()))
            .rejects.toThrow('Document not found');
    });
});