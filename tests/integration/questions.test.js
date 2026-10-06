import '../setup.js';

import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import Answer from '../../src/models/Answer.js';
import Question from '../../src/models/Question.js';
import Tag from '../../src/models/Tag.js';
import User from '../../src/models/User.js';
import app from '../../src/app.js';

process.env.JWT_SECRET = 'question-tests-secret';

const createUser = async (overrides = {}) => User.create({
    name: overrides.name ?? 'API User',
    email: overrides.email ?? `${new mongoose.Types.ObjectId()}@example.com`,
    password: 'password',
    isAdmin: overrides.isAdmin ?? false,
});

const tokenFor = (user) => jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET);

const createQuestion = async (author, overrides = {}) => Question.create({
    title: overrides.title ?? 'API question',
    description: overrides.description ?? 'API description',
    tags: overrides.tags ?? [],
    author: author._id,
});

const expectErrorEnvelope = (response, status, message) => {
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ success: false, message });
};

describe('Questions API', () => {
    beforeEach(async () => {
        await Promise.all([
            Answer.deleteMany({}),
            Question.deleteMany({}),
            Tag.deleteMany({}),
            User.deleteMany({}),
        ]);
    });

    it('returns an empty-list error envelope when no questions exist', async () => {
        const response = await request(app).get('/api/questions');

        expectErrorEnvelope(response, 404, 'No questions found');
    });

    it('returns the public question list with populated data and the standard envelope', async () => {
        const author = await createUser({ name: 'List Author' });
        const tag = await Tag.create({ name: 'api' });
        const question = await createQuestion(author, { tags: [tag._id] });
        await Answer.create({ questionId: question._id, answerText: 'An answer', author: author._id });

        const response = await request(app).get('/api/questions');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, message: 'Questions fetched successfully' });
        expect(response.body.data[0]).toMatchObject({
            author: { name: 'List Author' },
            tags: [{ name: 'api' }],
            answerCount: 1,
        });
    });

    it('returns several public questions in newest-first order', async () => {
        const author = await createUser();
        const older = await createQuestion(author, { title: 'Older question' });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const newer = await createQuestion(author, { title: 'Newer question' });

        const response = await request(app).get('/api/questions');

        expect(response.status).toBe(200);
        expect(response.body.data.map(({ title }) => title)).toEqual([
            newer.title,
            older.title,
        ]);
    });

    it('returns a public question detail, increments views, and includes answers', async () => {
        const author = await createUser();
        const question = await createQuestion(author);
        await Answer.create({ questionId: question._id, answerText: 'Public answer', author: author._id });

        const response = await request(app).get(`/api/questions/${question._id}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, message: 'Question fetched successfully' });
        expect(response.body.data.question.views).toBe(1);
        expect(response.body.data.answers).toHaveLength(1);
    });

    it('returns a missing detail error envelope', async () => {
        const response = await request(app).get(`/api/questions/${new mongoose.Types.ObjectId()}`);

        expectErrorEnvelope(response, 404, 'No question found');
    });

    it('returns a question detail with an empty answers array', async () => {
        const question = await createQuestion(await createUser());

        const response = await request(app).get(`/api/questions/${question._id}`);

        expect(response.status).toBe(200);
        expect(response.body.data.answers).toEqual([]);
    });

    it('returns public answers for a question', async () => {
        const author = await createUser();
        const question = await createQuestion(author);
        await Answer.create({ questionId: question._id, answerText: 'Route answer', author: author._id });

        const response = await request(app).get(`/api/questions/${question._id}/answers`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true, message: 'Answers fetched successfully' });
        expect(response.body.data[0]).toMatchObject({ answerText: 'Route answer', author: { name: 'API User' } });
    });

    it('returns a missing-answer error envelope for a question with no answers', async () => {
        const question = await createQuestion(await createUser());

        const response = await request(app).get(`/api/questions/${question._id}/answers`);

        expectErrorEnvelope(response, 404, 'No answers found');
    });

    it('returns the same missing-answer error for an unknown question', async () => {
        const response = await request(app)
            .get(`/api/questions/${new mongoose.Types.ObjectId()}/answers`);

        expectErrorEnvelope(response, 404, 'No answers found');
    });

    it('rejects every protected question endpoint without authentication', async () => {
        const question = await createQuestion(await createUser());
        const responses = await Promise.all([
            request(app).post('/api/questions').send({ title: 'x', description: 'y' }),
            request(app).put(`/api/questions/${question._id}`).send({ title: 'x', description: 'y' }),
            request(app).delete(`/api/questions/${question._id}`),
            request(app).post(`/api/questions/${question._id}/upvote`),
            request(app).post(`/api/questions/${question._id}/downvote`),
            request(app).post(`/api/questions/${question._id}/answers`).send({ answerText: 'x' }),
        ]);

        for (const response of responses) {
            expectErrorEnvelope(response, 401, 'No token provided, authorization denied.');
        }
    });

    it('creates a question with tags for an authenticated user', async () => {
        const author = await createUser();

        const response = await request(app)
            .post('/api/questions')
            .set('Authorization', `Bearer ${tokenFor(author)}`)
            .send({ title: 'Created question', description: 'Created description', tags: 'api, testing' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ success: true, message: 'Question created successfully' });
        expect(response.body.data).toMatchObject({
            title: 'Created question',
            description: 'Created description',
            author: author._id.toString(),
        });
        expect(response.body.data.tags).toHaveLength(2);
    });

    it('returns a 401 envelope for an invalid protected token', async () => {
        const response = await request(app)
            .post('/api/questions')
            .set('Authorization', 'Bearer invalid-token')
            .send({ title: 'x', description: 'y' });

        expectErrorEnvelope(response, 401, 'Token is not valid.');
    });

    it('rejects question creation when a required field is missing', async () => {
        const author = await createUser();

        const response = await request(app)
            .post('/api/questions')
            .set('Authorization', `Bearer ${tokenFor(author)}`)
            .send({ description: 'Missing title' });

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(await Question.countDocuments()).toBe(0);
    });

    it('allows the owner to update and delete a question', async () => {
        const author = await createUser();
        const question = await createQuestion(author);
        const authorization = `Bearer ${tokenFor(author)}`;

        const updateResponse = await request(app)
            .put(`/api/questions/${question._id}`)
            .set('Authorization', authorization)
            .send({ title: 'Updated question', description: 'Updated description', tags: 'updated' });
        const deleteResponse = await request(app)
            .delete(`/api/questions/${question._id}`)
            .set('Authorization', authorization);

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body).toMatchObject({ success: true, message: 'Question updated successfully' });
        expect(updateResponse.body.data.title).toBe('Updated question');
        expect(deleteResponse.status).toBe(200);
        expect(deleteResponse.body).toMatchObject({ success: true, message: 'Question deleted successfully' });
    });

    it('allows an admin to update and delete another user question', async () => {
        const author = await createUser();
        const admin = await createUser({ isAdmin: true });
        const question = await createQuestion(author);
        const authorization = `Bearer ${tokenFor(admin)}`;

        const updateResponse = await request(app)
            .put(`/api/questions/${question._id}`)
            .set('Authorization', authorization)
            .send({ title: 'Admin update', description: 'Admin description', tags: '' });
        const deleteResponse = await request(app)
            .delete(`/api/questions/${question._id}`)
            .set('Authorization', authorization);

        expect(updateResponse.status).toBe(200);
        expect(deleteResponse.status).toBe(200);
    });

    it('rejects another authenticated user from updating or deleting a question', async () => {
        const author = await createUser();
        const otherUser = await createUser();
        const question = await createQuestion(author);
        const authorization = `Bearer ${tokenFor(otherUser)}`;

        const updateResponse = await request(app)
            .put(`/api/questions/${question._id}`)
            .set('Authorization', authorization)
            .send({ title: 'Nope', description: 'Nope', tags: '' });
        const deleteResponse = await request(app)
            .delete(`/api/questions/${question._id}`)
            .set('Authorization', authorization);

        expectErrorEnvelope(updateResponse, 403, 'Not authorized to update this question');
        expectErrorEnvelope(deleteResponse, 403, 'Not authorized to delete this question');
    });

    it('returns not-found errors for protected mutations on missing questions', async () => {
        const user = await createUser();
        const authorization = `Bearer ${tokenFor(user)}`;
        const missingId = new mongoose.Types.ObjectId();

        const updateResponse = await request(app)
            .put(`/api/questions/${missingId}`)
            .set('Authorization', authorization)
            .send({ title: 'x', description: 'y', tags: '' });
        const deleteResponse = await request(app)
            .delete(`/api/questions/${missingId}`)
            .set('Authorization', authorization);

        expectErrorEnvelope(updateResponse, 404, 'Question not found');
        expectErrorEnvelope(deleteResponse, 404, 'Question not found');
    });

    it('rejects an authenticated downvote for a missing question', async () => {
        const voter = await createUser();

        const response = await request(app)
            .post(`/api/questions/${new mongoose.Types.ObjectId()}/downvote`)
            .set('Authorization', `Bearer ${tokenFor(voter)}`);

        expectErrorEnvelope(response, 500, 'Document not found');
    });

    it('handles authenticated upvotes, repeated votes, and downvote toggling', async () => {
        const author = await createUser();
        const voter = await createUser();
        const question = await createQuestion(author);
        const authorization = `Bearer ${tokenFor(voter)}`;

        const firstUpvote = await request(app)
            .post(`/api/questions/${question._id}/upvote`)
            .set('Authorization', authorization);
        const repeatedUpvote = await request(app)
            .post(`/api/questions/${question._id}/upvote`)
            .set('Authorization', authorization);
        const downvote = await request(app)
            .post(`/api/questions/${question._id}/downvote`)
            .set('Authorization', authorization);

        expect(firstUpvote).toMatchObject({ status: 200 });
        expect(firstUpvote.body).toMatchObject({ success: true, message: 'Question upvoted successfully' });
        expect(repeatedUpvote.body.data.voteCount).toBe(1);
        expect(downvote).toMatchObject({ status: 200 });
        expect(downvote.body).toMatchObject({ success: true, message: 'Question downvoted successfully' });
        expect(downvote.body.data.voteCount).toBe(-1);
    });

    it('returns the current vote error for missing question vote operations', async () => {
        const voter = await createUser();
        const authorization = `Bearer ${tokenFor(voter)}`;
        const response = await request(app)
            .post(`/api/questions/${new mongoose.Types.ObjectId()}/upvote`)
            .set('Authorization', authorization);

        expectErrorEnvelope(response, 500, 'Document not found');
    });

    it('creates an answer through the authenticated question route', async () => {
        const author = await createUser();
        const answerer = await createUser({ name: 'Answer Author' });
        const question = await createQuestion(author);

        const response = await request(app)
            .post(`/api/questions/${question._id}/answers`)
            .set('Authorization', `Bearer ${tokenFor(answerer)}`)
            .send({ answerText: 'New answer' });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ success: true, message: 'Answer created successfully' });
        expect(response.body.data).toMatchObject({ answerText: 'New answer', author: { name: 'Answer Author' } });
    });

    it('rejects answer creation when answerText is missing', async () => {
        const answerer = await createUser();
        const question = await createQuestion(await createUser());

        const response = await request(app)
            .post(`/api/questions/${question._id}/answers`)
            .set('Authorization', `Bearer ${tokenFor(answerer)}`)
            .send({});

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(await Answer.countDocuments({ questionId: question._id })).toBe(0);
    });

    it('currently permits answer creation for a missing question id', async () => {
        const answerer = await createUser();

        const response = await request(app)
            .post(`/api/questions/${new mongoose.Types.ObjectId()}/answers`)
            .set('Authorization', `Bearer ${tokenFor(answerer)}`)
            .send({ answerText: 'Orphan answer' });

        expect(response.status).toBe(201);
        expect(response.body.data.answerText).toBe('Orphan answer');
    });
});