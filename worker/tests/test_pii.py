from flatfox_worker.pii import strip_pii


class TestStripPii:
    def test_strips_email(self):
        assert "[EMAIL]" in strip_pii("Contact me at john@example.com")

    def test_strips_phone_swiss(self):
        result = strip_pii("Call 044 123 45 67")
        assert "044 123 45 67" not in result

    def test_strips_phone_international(self):
        result = strip_pii("Call +41 44 123 45 67")
        assert "+41 44 123 45 67" not in result

    def test_strips_name(self):
        result = strip_pii("Contact Hans Müller for details", names=["Hans Müller"])
        assert "Hans Müller" not in result
        assert "[NAME]" in result

    def test_preserves_normal_text(self):
        text = "Bright 3-room apartment in Zürich, CHF 1500/mo"
        assert strip_pii(text) == text

    def test_multiple_pii(self):
        text = "Email test@mail.ch or call 079 123 45 67"
        result = strip_pii(text)
        assert "test@mail.ch" not in result
        assert "079 123 45 67" not in result

    def test_short_name_ignored(self):
        result = strip_pii("Hi X", names=["X"])
        assert result == "Hi X"
