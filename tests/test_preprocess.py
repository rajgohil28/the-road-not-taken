import unittest

from scripts.preprocess_data import decode_event, is_human_user, world_to_pixel


class PreprocessTests(unittest.TestCase):
    def test_world_to_pixel_ambrose_readme_sample(self):
        px, py, in_bounds = world_to_pixel("AmbroseValley", -301.45, -355.55)
        self.assertTrue(in_bounds)
        self.assertAlmostEqual(px, 77.99, places=1)
        self.assertAlmostEqual(py, 890.37, places=1)

    def test_user_detection(self):
        self.assertTrue(is_human_user("f4e072fa-b7af-4761-b567-1d95b7ad0108"))
        self.assertFalse(is_human_user("1440"))

    def test_event_decode(self):
        self.assertEqual(decode_event(b"BotKilled"), "BotKilled")
        self.assertEqual(decode_event("Loot"), "Loot")


if __name__ == "__main__":
    unittest.main()
