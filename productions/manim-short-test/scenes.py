"""Placeholder vertical (1080x1920) scenes that prove the Shorts format of the Manim pipeline."""
from manim import *


def add_frame_code(scene):
    """Test aid: the frame number within the scene as 16 squares in the top-left corner (see manim-test)."""
    px = config.frame_width / config.pixel_width
    left, top = -config.frame_width / 2, config.frame_height / 2
    band = Rectangle(width=(16 * 24 + 16) * px, height=40 * px, fill_color=BLACK, fill_opacity=1, stroke_width=0)
    band.move_to([left + band.width / 2, top - band.height / 2, 0])
    bits = VGroup(*[Square(side_length=24 * px, stroke_width=0, fill_color=WHITE, fill_opacity=0) for _ in range(16)])
    for i, sq in enumerate(bits):
        sq.move_to([left + (8 + 24 * i + 12) * px, top - 20 * px, 0])

    def show(group, dt):  # dt makes it time-based, so Manim draws every frame of a wait instead of repeating one
        n = round(scene.renderer.time * config.frame_rate)
        for i, sq in enumerate(group):
            sq.set_fill(WHITE, opacity=1.0 if (n >> (15 - i)) & 1 else 0.0)

    bits.add_updater(show)
    band.set_z_index(100)
    bits.set_z_index(101)
    scene.add(band, bits)


class ShortCard(Scene):
    def construct(self):
        add_frame_code(self)
        # In the vertical format the frame is 4.5 units wide and 8 units tall.
        box = RoundedRectangle(width=3.8, height=5.5, corner_radius=0.3, color=TEAL)
        title = Text("Placeholder", font_size=60).move_to(box.get_top() + DOWN * 1)
        circle = Circle(radius=1, color=YELLOW).move_to(box.get_center() + DOWN * 0.5)
        self.play(Create(box), run_time=1)
        self.play(Write(title), GrowFromCenter(circle), run_time=1.5)
        self.play(circle.animate.scale(0.5).shift(DOWN * 1.2), run_time=1.5)
        self.wait(1)


class ShortEnd(Scene):
    def construct(self):
        add_frame_code(self)
        t = Text("Placeholder end", font_size=56)
        self.play(FadeIn(t, scale=0.8), run_time=1)
        self.wait(1.5)
        self.play(FadeOut(t), run_time=0.5)
