"""Placeholder scenes that prove the Manim render pipeline. Nothing here is from a real script."""
from manim import *


def add_frame_code(scene):
    """Test aid: the frame number within the scene as 16 white or black squares in the top-left corner
    (most significant bit first, 24 px squares from pixel 8,8), so the joined file can be checked for
    missing or repeated frames at every join. Not needed in real productions."""
    px = config.frame_width / config.pixel_width
    left, top = -config.frame_width / 2, config.frame_height / 2
    band = Rectangle(width=(16 * 24 + 16) * px, height=40 * px, fill_color=BLACK, fill_opacity=1, stroke_width=0)
    band.move_to([left + band.width / 2, top - band.height / 2, 0])
    bits = VGroup(*[Square(side_length=24 * px, stroke_width=0, fill_color=WHITE, fill_opacity=0) for _ in range(16)])
    for i, sq in enumerate(bits):
        sq.move_to([left + (8 + 24 * i + 12) * px, top - 20 * px, 0])

    def show(group):
        n = round(scene.renderer.time * config.frame_rate)
        for i, sq in enumerate(group):
            sq.set_fill(WHITE, opacity=1.0 if (n >> (15 - i)) & 1 else 0.0)

    bits.add_updater(show)
    band.set_z_index(100)
    bits.set_z_index(101)
    scene.add(band, bits)


class Intro(Scene):
    def construct(self):
        add_frame_code(self)
        title = Text("Placeholder Title", font_size=96, color=YELLOW)
        sub = Text("Manim pipeline test", font_size=48).next_to(title, DOWN, buff=0.5)
        self.play(Write(title), run_time=2)
        self.play(FadeIn(sub, shift=UP * 0.3), run_time=1)
        self.wait(2)
        self.play(FadeOut(title), FadeOut(sub), run_time=1)


class Graph(Scene):
    def construct(self):
        add_frame_code(self)
        axes = Axes(x_range=[0, 10, 1], y_range=[-1.5, 1.5, 0.5], x_length=11, y_length=5, tips=False)
        curve = axes.plot(lambda x: np.sin(x) * np.exp(-0.08 * x), color=BLUE)
        label = Text("Placeholder curve", font_size=40).to_edge(UP, buff=0.8)
        self.play(Create(axes), FadeIn(label), run_time=2)
        self.play(Create(curve), run_time=4)
        x = ValueTracker(0)
        dot = always_redraw(lambda: Dot(axes.c2p(x.get_value(), np.sin(x.get_value()) * np.exp(-0.08 * x.get_value())), color=RED))
        self.add(dot)
        self.play(x.animate.set_value(10), run_time=8, rate_func=linear)
        self.play(x.animate.set_value(3), run_time=4)
        self.wait(1)
        self.play(FadeOut(VGroup(axes, curve, label, dot)), run_time=1)


class Formula(Scene):
    def construct(self):
        add_frame_code(self)
        eq = MathTex(r"e^{i\pi} + 1 = 0", font_size=120)
        note = Tex(r"Placeholder \LaTeX{} line", font_size=56).next_to(eq, DOWN, buff=0.6)
        self.play(Write(eq), run_time=2)
        self.play(FadeIn(note), run_time=1)
        self.wait(2)
        self.play(FadeOut(eq), FadeOut(note), run_time=1)
