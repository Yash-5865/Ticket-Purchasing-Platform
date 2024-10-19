import express, { Request, Response } from 'express';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/cinema_db');

// Cinema model
const CinemaSchema = new mongoose.Schema({
  seats: [{ type: Boolean, default: false }]
});

const Cinema = mongoose.model('Cinema', CinemaSchema);

// Create a cinema
app.post('/cinema', async (req: Request, res: Response) => {
  const { seats } = req.body;
  if (!seats || seats <= 0) {
    return res.status(400).json({ error: 'Invalid number of seats' });
  }

  const cinema = new Cinema({ seats: Array(seats).fill(false) });
  await cinema.save();
  res.json({ cinemaId: cinema._id });
});

// Purchase a specific seat
app.post('/purchase/:cinemaId/:seatNumber', async (req: Request, res: Response) => {
  const { cinemaId, seatNumber } = req.params;
  const seatIndex = parseInt(seatNumber) - 1;

  const cinema = await Cinema.findById(cinemaId);
  if (!cinema) {
    return res.status(404).json({ error: 'Cinema not found' });
  }

  if (seatIndex < 0 || seatIndex >= cinema.seats.length) {
    return res.status(400).json({ error: 'Invalid seat number' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updatedCinema = await Cinema.findOneAndUpdate(
      { _id: cinemaId, [`seats.${seatIndex}`]: false },
      { $set: { [`seats.${seatIndex}`]: true } },
      { new: true, session }
    );

    if (!updatedCinema) {
      throw new Error('Seat already purchased');
    }

    await session.commitTransaction();
    res.json({ seat: seatIndex + 1 });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: 'Seat already purchased or not available' });
  } finally {
    session.endSession();
  }
});

// Purchase first two consecutive seats
app.post('/purchase-consecutive/:cinemaId', async (req: Request, res: Response) => {
  const { cinemaId } = req.params;

  const cinema = await Cinema.findById(cinemaId);
  if (!cinema) {
    return res.status(404).json({ error: 'Cinema not found' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (let i = 0; i < cinema.seats.length - 1; i++) {
      if (!cinema.seats[i] && !cinema.seats[i + 1]) {
        const updatedCinema = await Cinema.findOneAndUpdate(
          { _id: cinemaId, [`seats.${i}`]: false, [`seats.${i + 1}`]: false },
          { $set: { [`seats.${i}`]: true, [`seats.${i + 1}`]: true } },
          { new: true, session }
        );

        if (updatedCinema) {
          await session.commitTransaction();
          return res.json({ seats: [i + 1, i + 2] });
        }
      }
    }

    throw new Error('No consecutive seats available');
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: 'No consecutive seats available' });
  } finally {
    session.endSession();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
