var posts=["posts/个人简历/","posts/力扣-2-两数相加（Add-Two-Numbers）/","posts/力扣-1-两数之和（Two-Sum）/","posts/力扣-3-无重复字符的最长子串（Longest-Substring-Without-Repeating-Characters）/","posts/实用工具-Dev-C++/","posts/项目推荐-SDL太空战机射击游戏-SDLShooter/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };